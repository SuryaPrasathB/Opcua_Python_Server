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
SCADA_DATA_FILE = 'scada_data.json' # Ensure this is defined

# Global variables for OPC UA client and connection status
opcua_client = None
opcua_connected = False
opcua_endpoint = "" # This will store the currently connected/desired endpoint URL
connection_lock = asyncio.Lock() # To prevent concurrent connection attempts

# Global variable to hold OPC UA client connection for subscriptions (not directly used in this snippet but kept for context)
opcua_clients_for_sub = {}
subscription_handlers = {}
stop_polling_events = {}
polling_threads = {}


# Ensure config.json and scada_data.json exist with proper initial structure
def initialize_config_files():
    if not os.path.exists(CONFIG_FILE) or os.path.getsize(CONFIG_FILE) == 0:
        print(f"Initializing {CONFIG_FILE} with default structure.")
        with open(CONFIG_FILE, "w") as f:
            json.dump(
                {"opcua_endpoint": "", "servers": [], "nodes": [], "groups": [], "layout": {}, "scada_layout": {}}, f, indent=2
            )
    
    if not os.path.exists(SCADA_DATA_FILE) or os.path.getsize(SCADA_DATA_FILE) == 0:
        print(f"Initializing {SCADA_DATA_FILE} with empty list.")
        with open(SCADA_DATA_FILE, 'w') as f:
            json.dump([], f, indent=4)

# Call initialization at the start
initialize_config_files()


def load_config():
    """Loads configuration from config.json. Ensures default keys exist."""
    try:
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        print(f"Warning: {CONFIG_FILE} not found or invalid. Re-initializing.")
        initialize_config_files() # Re-initialize if file is bad
        with open(CONFIG_FILE, "r") as f: # Try loading again
            config = json.load(f)

    # Ensure all expected top-level keys are present with default empty values if missing
    config.setdefault("opcua_endpoint", "")
    config.setdefault("servers", [])
    config.setdefault("nodes", [])
    config.setdefault("groups", [])
    config.setdefault("layout", {})
    config.setdefault("scada_layout", {})
    return config

def save_config(config):
    """Saves configuration to config.json."""
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)

def load_scada_data():
    if os.path.exists(SCADA_DATA_FILE):
        try:
            with open(SCADA_DATA_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: {SCADA_DATA_FILE} is empty or invalid JSON. Re-initializing.")
            save_scada_data([]) # Reset to empty list
            return []
    return []

def save_scada_data(data):
    with open(SCADA_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)


async def disconnect_opcua():
    """Disconnects the OPC UA client if it's connected."""
    global opcua_client, opcua_connected, opcua_endpoint
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
            opcua_endpoint = "" # Clear the endpoint on disconnect


async def connect_opcua():
    """Establishes connection to the OPC UA server."""
    global opcua_client, opcua_connected, opcua_endpoint

    async with connection_lock:
        current_configured_endpoint = load_config().get("opcua_endpoint") # Load fresh config

        if not current_configured_endpoint:
            opcua_connected = False
            print("OPC UA Endpoint not configured.")
            return False

        # If the global opcua_client is None OR the endpoint has changed,
        # we need to create a new client instance.
        if opcua_client is None or opcua_endpoint != current_configured_endpoint:
            # If an old client exists, disconnect it first
            if opcua_client:
                print(f"Disconnecting from old endpoint {opcua_endpoint if opcua_endpoint else 'unknown'} before connecting to {current_configured_endpoint}")
                try:
                    await opcua_client.disconnect()
                except Exception as e:
                    print(f"Error during old client disconnect: {e}")
            
            print(f"Creating new OPC UA client for: {current_configured_endpoint}")
            opcua_client = Client(url=current_configured_endpoint)
            opcua_endpoint = current_configured_endpoint # Update global endpoint to the new one
        else:
            print(f"OPC UA client already initialized for {current_configured_endpoint}. Reusing existing client.")

        try:
            print(f"Attempting to connect/reconnect to OPC UA server: {opcua_endpoint}")
            await opcua_client.connect()
            opcua_connected = True
            print(f"Successfully connected to OPC UA server: {opcua_endpoint}")
            return True
        except CancelledError:
            print("OPC UA connection attempt cancelled.")
            opcua_connected = False
            opcua_client = None
            opcua_endpoint = "" # Clear endpoint on failed connection
            return False
        except Exception as e:
            opcua_connected = False
            opcua_client = None
            opcua_endpoint = "" # Clear endpoint on failed connection
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
    current_config = load_config() # Load config here
    if current_config.get("opcua_endpoint"):
        return redirect("/dashboard")
    return redirect("/configure")


@app.route("/configure", methods=["GET", "POST"])
async def configure():
    """Handles OPC UA endpoint configuration."""
    # Load config inside the function to ensure it's always fresh
    config = load_config() 
    if request.method == "POST":
        new_endpoint = request.form.get("opcua_endpoint")
        if new_endpoint:
            # Check if endpoint has changed before disconnecting
            if config.get("opcua_endpoint") != new_endpoint:
                await disconnect_opcua()
            
            config["opcua_endpoint"] = new_endpoint
            
            # --- NEW LOGIC: Add/Update this endpoint in the 'servers' list ---
            server_exists = False
            for server in config.get('servers', []):
                if server.get('url') == new_endpoint:
                    server_exists = True
                    server['name'] = f"Server ({new_endpoint.split('//')[-1].split('/')[0]})" # Update name
                    break
            
            if not server_exists:
                # Generate a new ID for this server entry if it's new
                new_server_id = str(uuid.uuid4())
                config['servers'].append({
                    "id": new_server_id,
                    "name": f"Server ({new_endpoint.split('//')[-1].split('/')[0]})", # Simple name from URL
                    "url": new_endpoint
                })
                print(f"Added new server entry to config['servers']: {new_endpoint}")
            # --- END NEW LOGIC ---

            save_config(config)
            # Re-connect to the new/updated endpoint immediately
            await connect_opcua() 
            return redirect("/dashboard")
        else:
            return render_template(
                "configure.html",
                error="OPC UA Endpoint cannot be empty.",
                current_endpoint=config.get("opcua_endpoint", ""),
            )
    return render_template(
        "configure.html", current_endpoint=load_config().get("opcua_endpoint", "") # Load fresh config for GET
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

@app.route("/historical")
async def historical():
    """Renders the historical data page."""
    await connect_opcua()
    return render_template("historical.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    """Returns the current application configuration."""
    return jsonify(load_config()) # Always load fresh config


@app.route("/api/nodes", methods=["GET"])
def get_nodes():
    """Returns all configured OPC UA nodes."""
    return jsonify(load_config()["nodes"]) # Load fresh config


@app.route("/api/nodes", methods=["POST"])
async def add_or_update_node(): # Made async to allow await for config
    """Adds a new node or updates an existing one."""
    data = request.json
    node_id = data.get("id")
    name = data.get("name")
    node_ua_id = data.get("node_ua_id")
    node_type = data.get("type")
    size = data.get("size")
    group_id = data.get("groupId")
    unit = data.get("unit") # Get unit

    if not all([name, node_ua_id, node_type, size]):
        return jsonify({"error": "Missing required fields (name, node_ua_id, type, size)."}), 400

    current_config = load_config() # Load fresh config

    # Determine the server_id based on the currently configured opcua_endpoint
    configured_endpoint_url = current_config.get("opcua_endpoint")
    if not configured_endpoint_url:
        return jsonify({"error": "OPC UA endpoint is not configured. Please configure it first."}), 400
    
    primary_server_id = None
    for server in current_config.get("servers", []):
        if server.get("url") == configured_endpoint_url:
            primary_server_id = server.get("id")
            break
    
    if not primary_server_id:
        return jsonify({"error": "Could not find server ID for the configured OPC UA endpoint. Please re-save your endpoint."}), 400

    if node_id:
        for i, node in enumerate(current_config["nodes"]):
            if node["id"] == node_id:
                current_config["nodes"][i].update(
                    {
                        "name": name,
                        "node_ua_id": node_ua_id,
                        "type": node_type,
                        "size": size,
                        "groupId": group_id,
                        "unit": unit # Update unit
                    }
                )
                save_config(current_config)
                return jsonify(current_config["nodes"][i])
        return jsonify({"error": "Node not found."}), 404
    else:
        new_node = {
            "id": str(uuid.uuid4()),
            "name": name,
            "node_ua_id": node_ua_id,
            "type": node_type,
            "size": size,
            "groupId": group_id,
            "server_id": primary_server_id, # Assign the primary server ID
            "unit": unit, # Store unit
            "value": None,
            "x": 0,
            "y": 0,
        }
        current_config["nodes"].append(new_node)
        save_config(current_config)
        return jsonify(new_node), 201


@app.route("/api/nodes/<node_id>", methods=["DELETE"])
def delete_node(node_id):
    """Deletes a node by its UI ID."""
    config = load_config() # Load fresh config
    initial_len = len(config["nodes"])
    config["nodes"] = [node for node in config["nodes"] if node["id"] != node_id]
    if len(config["nodes"]) < initial_len:
        if node_id in config["layout"]:
            del config["layout"][node_id]
        # Ensure scada_layout is treated as an array of objects
        if isinstance(config.get("scada_layout"), list):
            config["scada_layout"] = [el for el in config["scada_layout"] if el.get("node_id") != node_id]
        else: # Handle older object format if it exists
            if node_id in config.get("scada_layout", {}):
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
    config = load_config() # Load fresh config
    data = request.json
    config["layout"] = data
    save_config(config)
    return jsonify({"message": "Layout saved successfully."}), 200

# New API endpoint for SCADA layout
@app.route("/api/scada_layout", methods=["GET"])
def get_scada_layout():
    """Returns the current SCADA layout."""
    return jsonify(load_config().get("scada_layout", [])) # Load fresh config, ensure it's an array

@app.route("/api/scada_layout", methods=["POST"])
def save_scada_layout():
    """Saves the current SCADA layout."""
    config = load_config() # Load fresh config
    data = request.json # Data is expected to be the entire array of SCADA elements
    config["scada_layout"] = data
    save_config(config)
    return jsonify({"message": "SCADA layout saved successfully."}), 200


@app.route("/api/groups", methods=["GET"])
def get_groups():
    """Returns all configured groups."""
    return jsonify(load_config()["groups"]) # Load fresh config


@app.route("/api/groups", methods=["POST"])
def add_or_update_group():
    """Adds a new group or updates an existing one."""
    data = request.json
    group_id = data.get("id")
    title = data.get("title")
    size = data.get("size")

    if not all([title, size]):
        return jsonify({"error": "Group title and size are required."}), 400

    current_config = load_config() # Load fresh config

    if group_id:
        for i, group in enumerate(current_config["groups"]):
            if group["id"] == group_id:
                current_config["groups"][i].update(
                    {
                        "title": title,
                        "size": size
                    }
                )
                save_config(current_config)
                return jsonify(current_config["groups"][i])
        return jsonify({"error": "Group not found."}), 404
    else:
        new_group = {
            "id": str(uuid.uuid4()),
            "title": title,
            "size": size,
            "x": 0,
            "y": 0,
        }
        current_config["groups"].append(new_group)
        save_config(current_config)
        return jsonify(new_group), 201


@app.route("/api/groups/<group_id>", methods=["DELETE"])
def delete_group(group_id):
    """Deletes a group by its ID."""
    config = load_config() # Load fresh config
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

@app.route('/api/historical_data', methods=['GET'])
def get_historical_data():
    node_id = request.args.get('node_id')
    start_time_str = request.args.get('start_time')
    end_time_str = request.args.get('end_time')

    if not node_id:
        return jsonify({"error": "node_id parameter is required"}), 400

    historical_data = load_scada_data()
    
    filtered_data = []
    from datetime import datetime
    for entry in historical_data:
        if entry.get('node_id') == node_id:
            try:
                entry_time = datetime.fromisoformat(entry['timestamp'])
                
                if start_time_str:
                    start_time = datetime.fromisoformat(start_time_str)
                    if entry_time < start_time:
                        continue
                if end_time_str:
                    end_time = datetime.fromisoformat(end_time_str)
                    if entry_time > end_time:
                        continue
                
                filtered_data.append(entry)
            except ValueError:
                print(f"Warning: Could not parse timestamp for entry: {entry}")
                continue
    
    filtered_data.sort(key=lambda x: datetime.fromisoformat(x['timestamp']))

    return jsonify(filtered_data), 200


# Create an ASGI-compatible application from your Flask app
asgi_app = WsgiToAsgi(app)

if __name__ == "__main__":
    import uvicorn
    print("Running application with Uvicorn...")
    uvicorn.run("app:asgi_app", host="0.0.0.0", port=5000, reload=True)
