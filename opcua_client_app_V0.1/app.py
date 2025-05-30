import asyncio
import json
import os
import uuid
from functools import wraps

from asyncua import Client, ua
from asyncio.exceptions import CancelledError
from flask import Flask, jsonify, redirect, render_template, request
from asgiref.wsgi import WsgiToAsgi

app = Flask(__name__)
CONFIG_FILE = "config.json"

# Global variables for OPC UA client and connection status
opcua_client = None
opcua_connected = False
opcua_endpoint = ""
connection_lock = asyncio.Lock() # To prevent concurrent connection attempts


def load_config():
    """Loads configuration from config.json."""
    if not os.path.exists(CONFIG_FILE):
        # Create a default config.json if it doesn't exist
        with open(CONFIG_FILE, "w") as f:
            json.dump(
                {"opcua_endpoint": "", "nodes": [], "groups": [], "layout": {}, "scada_layout": {}}, f # Added scada_layout
            )
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)


def save_config(config):
    """Saves configuration to config.json."""
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


config = load_config()


async def disconnect_opcua():
    """Disconnects the OPC UA client if it's connected."""
    global opcua_client, opcua_connected
    if opcua_client:
        try:
            print("Attempting to disconnect OPC UA client...")
            await opcua_client.disconnect()
            print("OPC UA client disconnected.")
        except Exception as e:
            print(f"Error during OPC UA client disconnection: {e}")
        finally:
            opcua_client = None
            opcua_connected = False


async def connect_opcua():
    """Establishes connection to the OPC UA server."""
    global opcua_client, opcua_connected, opcua_endpoint

    async with connection_lock:
        current_configured_endpoint = config.get("opcua_endpoint")

        if opcua_connected and opcua_endpoint == current_configured_endpoint and opcua_client:
            print("OPC UA client already connected to the current endpoint.")
            return True

        if opcua_client and opcua_endpoint != current_configured_endpoint:
            print("Endpoint changed or client exists, disconnecting old client.")
            await disconnect_opcua()

        opcua_endpoint = current_configured_endpoint
        if not opcua_endpoint:
            opcua_connected = False
            print("OPC UA Endpoint not configured.")
            return False

        try:
            print(f"Attempting to connect to OPC UA server: {opcua_endpoint}")
            opcua_client = Client(url=opcua_endpoint)
            await opcua_client.connect()
            opcua_connected = True
            print(f"Successfully connected to OPC UA server: {opcua_endpoint}")
            return True
        except CancelledError:
            print("OPC UA connection attempt cancelled.")
            opcua_connected = False
            opcua_client = None
            return False
        except Exception as e:
            opcua_connected = False
            opcua_client = None
            print(f"Failed to connect to OPC UA server at {opcua_endpoint}: {e}")
            return False


def opcua_required(f):
    """Decorator to ensure OPC UA client is connected before API call."""

    @wraps(f)
    async def decorated_function(*args, **kwargs):
        if not opcua_connected:
            connected = await connect_opcua()
            if not connected:
                return (
                    jsonify({"error": "OPC UA client not connected. Configure endpoint."}),
                    503,
                )
        return await f(*args, **kwargs)

    return decorated_function


@app.route("/")
def index():
    """Redirects to configure or dashboard based on endpoint presence."""
    if config.get("opcua_endpoint"):
        return redirect("/dashboard")
    return redirect("/configure")


@app.route("/configure", methods=["GET", "POST"])
async def configure():
    """Handles OPC UA endpoint configuration."""
    global config
    if request.method == "POST":
        new_endpoint = request.form.get("opcua_endpoint")
        if new_endpoint:
            if config.get("opcua_endpoint") != new_endpoint:
                await disconnect_opcua()
            config["opcua_endpoint"] = new_endpoint
            save_config(config)
            await connect_opcua()
            return redirect("/dashboard")
        else:
            return render_template(
                "configure.html",
                error="OPC UA Endpoint cannot be empty.",
                current_endpoint=config.get("opcua_endpoint", ""),
            )
    return render_template(
        "configure.html", current_endpoint=config.get("opcua_endpoint", "")
    )


@app.route("/dashboard")
async def dashboard():
    """Renders the main dashboard page."""
    await connect_opcua()
    return render_template("dashboard.html")


# New SCADA route
@app.route("/scada")
async def scada():
    """Renders the SCADA page."""
    await connect_opcua()
    return render_template("scada.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    """Returns the current application configuration."""
    return jsonify(config)


@app.route("/api/nodes", methods=["GET"])
def get_nodes():
    """Returns all configured OPC UA nodes."""
    return jsonify(config["nodes"])


@app.route("/api/nodes", methods=["POST"])
def add_or_update_node():
    """Adds a new node or updates an existing one."""
    data = request.json
    node_id = data.get("id")
    name = data.get("name")
    node_ua_id = data.get("node_ua_id")
    node_type = data.get("type")
    size = data.get("size") # New: Get size
    group_id = data.get("groupId")

    if not all([name, node_ua_id, node_type, size]): # New: size is required
        return jsonify({"error": "Missing required fields."}), 400

    if node_id:
        for i, node in enumerate(config["nodes"]):
            if node["id"] == node_id:
                config["nodes"][i].update(
                    {
                        "name": name,
                        "node_ua_id": node_ua_id,
                        "type": node_type,
                        "size": size, # New: Update size
                        "groupId": group_id,
                    }
                )
                save_config(config)
                return jsonify(config["nodes"][i])
        return jsonify({"error": "Node not found."}), 404
    else:
        new_node = {
            "id": str(uuid.uuid4()),
            "name": name,
            "node_ua_id": node_ua_id,
            "type": node_type,
            "size": size, # New: Store size
            "groupId": group_id,
            "value": None,
            "x": 0,
            "y": 0,
            # Removed width/height as they are derived from size on frontend
        }
        config["nodes"].append(new_node)
        save_config(config)
        return jsonify(new_node), 201


@app.route("/api/nodes/<node_id>", methods=["DELETE"])
def delete_node(node_id):
    """Deletes a node by its UI ID."""
    global config
    initial_len = len(config["nodes"])
    config["nodes"] = [node for node in config["nodes"] if node["id"] != node_id]
    if len(config["nodes"]) < initial_len:
        if node_id in config["layout"]:
            del config["layout"][node_id]
        if node_id in config["scada_layout"]: # Also remove from SCADA layout
            del config["scada_layout"][node_id]
        save_config(config)
        return jsonify({"message": "Node deleted successfully."}), 200
    return jsonify({"error": "Node not found."}), 404


@app.route("/api/node_value/<path:node_ua_id>", methods=["GET"])
@opcua_required
async def read_node_value(node_ua_id):
    """Reads the value of an OPC UA node."""
    try:
        node = opcua_client.get_node(node_ua_id)
        value = await node.read_value()
        if isinstance(value, ua.Variant):
            value = value.Value
        return jsonify({"node_ua_id": node_ua_id, "value": str(value)})
    except CancelledError:
        print(f"OPC UA read for {node_ua_id} cancelled.")
        await disconnect_opcua()
        return jsonify({"error": f"OPC UA read operation cancelled for {node_ua_id}."}), 500
    except Exception as e:
        print(f"Error during read for {node_ua_id}: {e}")
        await disconnect_opcua()
        return jsonify({"error": f"Failed to read node {node_ua_id}: {e}"}), 500


@app.route("/api/node_value/<path:node_ua_id>", methods=["POST"])
@opcua_required
async def write_node_value(node_ua_id):
    """Writes a value to an OPC UA node."""
    data = request.json
    value_to_write = data.get("value")
    node_type = data.get("type")

    if value_to_write is None:
        return jsonify({"error": "Value to write is missing."}), 400

    try:
        node = opcua_client.get_node(node_ua_id)
        current_variant = await node.read_data_value()
        current_data_type = current_variant.Value.VariantType

        if node_type == "switch":
            val = bool(value_to_write)
            variant = ua.Variant(val, ua.VariantType.Boolean)
        elif current_data_type == ua.VariantType.Int64:
            val = int(value_to_write)
            variant = ua.Variant(val, ua.VariantType.Int64)
        elif current_data_type == ua.VariantType.Int32:
            val = int(value_to_write)
            variant = ua.Variant(val, ua.VariantType.Int32)
        elif current_data_type == ua.VariantType.Float:
            val = float(value_to_write)
            variant = ua.Variant(val, ua.VariantType.Float)
        elif current_data_type == ua.VariantType.Double:
            val = float(value_to_write)
            variant = ua.Variant(val, ua.VariantType.Double)
        elif current_data_type == ua.VariantType.String:
            val = str(value_to_write)
            variant = ua.Variant(val, ua.VariantType.String)
        else:
            val = str(value_to_write)
            variant = ua.Variant(val, ua.VariantType.String)

        await node.write_value(variant)
        return jsonify({"node_ua_id": node_ua_id, "message": "Value written successfully."})
    except CancelledError:
        print(f"OPC UA write for {node_ua_id} cancelled.")
        await disconnect_opcua()
        return jsonify({"error": f"OPC UA write operation cancelled for {node_ua_id}."}), 500
    except Exception as e:
        print(f"Error during write to node {node_ua_id}: {e}")
        await disconnect_opcua()
        return jsonify({"error": f"Failed to write to node {node_ua_id}: {e}"}), 500


@app.route("/api/layout", methods=["POST"])
def save_layout():
    """Saves the current UI layout (positions, sizes of nodes and groups)."""
    data = request.json
    config["layout"] = data
    save_config(config)
    return jsonify({"message": "Layout saved successfully."}), 200

# New API endpoint for SCADA layout
@app.route("/api/scada_layout", methods=["GET"])
def get_scada_layout():
    """Returns the current SCADA layout."""
    return jsonify(config.get("scada_layout", {}))

@app.route("/api/scada_layout", methods=["POST"])
def save_scada_layout():
    """Saves the current SCADA layout."""
    data = request.json
    config["scada_layout"] = data
    save_config(config)
    return jsonify({"message": "SCADA layout saved successfully."}), 200


@app.route("/api/groups", methods=["GET"])
def get_groups():
    """Returns all configured groups."""
    return jsonify(config["groups"])


@app.route("/api/groups", methods=["POST"])
def add_or_update_group():
    """Adds a new group or updates an existing one."""
    data = request.json
    group_id = data.get("id")
    title = data.get("title")
    size = data.get("size") # New: Get size

    if not all([title, size]): # New: size is required
        return jsonify({"error": "Group title and size are required."}), 400

    if group_id:
        for i, group in enumerate(config["groups"]):
            if group["id"] == group_id:
                config["groups"][i].update(
                    {
                        "title": title,
                        "size": size # New: Update size
                    }
                )
                save_config(config)
                return jsonify(config["groups"][i])
        return jsonify({"error": "Group not found."}), 404
    else:
        new_group = {
            "id": str(uuid.uuid4()),
            "title": title,
            "size": size, # New: Store size
            "x": 0,
            "y": 0,
            # Removed width/height as they are derived from size on frontend
        }
        config["groups"].append(new_group)
        save_config(config)
        return jsonify(new_group), 201


@app.route("/api/groups/<group_id>", methods=["DELETE"])
def delete_group(group_id):
    """Deletes a group by its ID."""
    global config
    initial_len = len(config["groups"])
    config["groups"] = [group for group in config["groups"] if group["id"] != group_id]
    if len(config["groups"]) < initial_len:
        for node in config["nodes"]:
            if node.get("groupId") == group_id:
                node["groupId"] = None
        if group_id in config["layout"]:
            del config["layout"][group_id]
        save_config(config)
        return jsonify({"message": "Group deleted successfully."}), 200
    return jsonify({"error": "Group not found."}), 404

# Create an ASGI-compatible application from your Flask app
asgi_app = WsgiToAsgi(app)

if __name__ == "__main__":
    import uvicorn
    print("Running application with Uvicorn...")
    uvicorn.run("app:asgi_app", host="0.0.0.0", port=5000, reload=True)
