document.addEventListener('DOMContentLoaded', async () => {
    const availableNodesPane = document.getElementById('available-nodes-pane');
    const scadaMainPane = document.getElementById('scada-main-pane');
    const saveScadaLayoutBtn = document.getElementById('saveScadaLayoutBtn');
    const noAvailableNodesMessage = document.getElementById('no-available-nodes-message');
    const noScadaElementsMessage = document.getElementById('no-scada-elements-message');

    let allConfiguredNodes = []; // All nodes from the dashboard
    let scadaElements = {}; // Stores {nodeId: {x, y}} for elements dropped on SCADA
    const API_BASE = '/api';
    const POLLING_INTERVAL = 5000; // Poll every 5 seconds

    /**
     * Displays a temporary message box.
     * @param {string} message - The message to display.
     * @param {string} type - 'success', 'error', 'info'.
     */
    function showMessageBox(message, type = 'info') {
        const messageBox = document.getElementById('messageBox');
        const messageText = document.getElementById('messageText');

        if (!messageBox || !messageText) {
            console.warn("MessageBox elements not found. Cannot display message:", message);
            return;
        }

        messageText.textContent = message;
        messageBox.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl z-20 transition-all duration-300 ease-in-out transform';

        // Set background color based on type
        switch (type) {
            case 'success':
                messageBox.classList.add('bg-green-600', 'text-white');
                break;
            case 'error':
                messageBox.classList.add('bg-red-600', 'text-white');
                break;
            case 'info':
            default:
                messageBox.classList.add('bg-gray-800', 'text-white');
                break;
        }

        messageBox.classList.remove('hidden', 'translate-x-full');
        messageBox.classList.add('translate-x-0');

        setTimeout(() => {
            messageBox.classList.remove('translate-x-0');
            messageBox.classList.add('translate-x-full');
            setTimeout(() => {
                messageBox.classList.add('hidden');
                messageBox.className = 'fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-xl z-20 hidden'; // Reset classes
            }, 300); // Allow transition to finish
        }, 3000); // Message disappears after 3 seconds
    }

    /**
     * Fetches data from the API.
     * @param {string} url - The API endpoint.
     * @returns {Promise<Object>} - The JSON response.
     */
    async function fetchData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            showMessageBox(`Error fetching data: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Sends data to the API (POST, PUT, DELETE).
     * @param {string} url - The API endpoint.
     * @param {string} method - HTTP method (POST, PUT, DELETE).
     * @param {Object} data - Data to send (for POST/PUT).
     * @returns {Promise<Object>} - The JSON response.
     */
    async function sendData(url, method, data = null) {
        try {
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };
            if (data) {
                options.body = JSON.stringify(data);
            }
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Send data error:', error);
            showMessageBox(`Error: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Adds a node to the SCADA display programmatically (e.g., via button click).
     * @param {string} nodeId - The ID of the node to add.
     */
    function addNodeToScada(nodeId) {
        const node = allConfiguredNodes.find(n => n.id === nodeId);
        if (!node) {
            console.warn(`SCADA: Attempted to add unknown node ID: ${nodeId}`);
            showMessageBox('Node not found.', 'error');
            return;
        }

        if (scadaElements[nodeId]) {
            showMessageBox(`Node "${node.name}" is already on the SCADA display.`, 'info');
            return;
        }

        // Calculate a default position to avoid stacking.
        // We'll place them incrementally down and to the right.
        const numExistingElements = Object.keys(scadaElements).length;
        const offsetX = 20 + (numExistingElements % 5) * 120; // 5 elements per row roughly
        const offsetY = 20 + Math.floor(numExistingElements / 5) * 120;

        scadaElements[nodeId] = { x: offsetX, y: offsetY };
        renderScadaDisplay(); // Re-render to show new element
        renderAvailableNodes(); // Re-render available nodes to grey out the added one
        showMessageBox(`Node "${node.name}" added to SCADA display.`, 'success');
    }

    /**
     * Renders an available node in the left pane.
     * @param {Object} node - Node data.
     * @param {boolean} isPlaced - True if the node is already on the SCADA display.
     * @returns {HTMLElement} - The created element.
     */
    function renderAvailableNode(node, isPlaced) {
        const nodeDiv = document.createElement('div');
        nodeDiv.id = `available-node-${node.id}`;
        // Add the new class 'scada-draggable-node'
        nodeDiv.className = 'p-2 rounded-lg shadow-sm text-center relative'; // Added relative for button positioning
        nodeDiv.setAttribute('data-node-id', node.id);
        nodeDiv.setAttribute('data-node-type', node.type); // Store type for SCADA rendering

        const nameSpan = document.createElement('span');
        nameSpan.textContent = node.name;
        nameSpan.className = 'block truncate pr-6'; // Add padding-right for the icon

        nodeDiv.appendChild(nameSpan);

        if (isPlaced) {
            nodeDiv.classList.add('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500', 'dark:text-gray-400', 'cursor-not-allowed', 'opacity-70');
            nodeDiv.setAttribute('draggable', 'false'); // Make it non-draggable
        } else {
            nodeDiv.classList.add('bg-white', 'dark:bg-gray-600', 'text-gray-800', 'dark:text-gray-200', 'cursor-grab');
            nodeDiv.setAttribute('draggable', 'true'); // Make it draggable
            nodeDiv.style.touchAction = 'none'; // Crucial for preventing default touch behaviors on draggable elements
            nodeDiv.classList.add('scada-draggable-node'); // Add draggable class here for interact.js

            nodeDiv.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', node.id);
                e.dataTransfer.effectAllowed = 'copy'; // Indicate a copy operation
                console.log(`SCADA: Dragging started for node: ${node.name} (ID: ${node.id})`); // Debugging log
            });

            // Add the "Add to SCADA" icon
            const addIcon = document.createElement('i');
            addIcon.className = 'fas fa-plus-circle text-blue-500 hover:text-blue-700 absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer';
            addIcon.title = `Add ${node.name} to SCADA`;
            addIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent dragstart if icon is part of draggable element
                addNodeToScada(node.id);
            });
            nodeDiv.appendChild(addIcon);
        }

        return nodeDiv;
    }

    /**
     * Renders a SCADA element in the main display pane.
     * @param {Object} node - Node data.
     * @param {number} x - X position.
     * @param {number} y - Y position.
     * @returns {HTMLElement} - The created SCADA element.
     */
    function renderScadaElement(node, x, y) {
        const elementDiv = document.createElement('div');
        elementDiv.id = `scada-element-${node.id}`;
        elementDiv.className = 'scada-element absolute flex flex-col items-center justify-center p-2 rounded-lg shadow-md transition-colors duration-200';
        elementDiv.setAttribute('data-node-id', node.id);
        elementDiv.setAttribute('data-x', x);
        elementDiv.setAttribute('data-y', y);
        elementDiv.style.left = `${x}px`;
        elementDiv.style.top = `${y}px`;
        elementDiv.style.width = '100px'; // Fixed size for SCADA elements
        elementDiv.style.height = '100px'; // Fixed size for SCADA elements
        elementDiv.style.touchAction = 'none'; // Disable default touch actions for draggable elements

        // Remove element button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'absolute top-0 right-0 -mt-2 -mr-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Remove from SCADA';
        removeBtn.onclick = () => {
            if (confirm(`Are you sure you want to remove "${node.name}" from the SCADA display?`)) {
                delete scadaElements[node.id];
                renderScadaDisplay();
                renderAvailableNodes(); // Make it available again in the left pane
                showMessageBox(`Node "${node.name}" removed from SCADA display.`, 'info');
            }
        };
        elementDiv.appendChild(removeBtn);

        // Add group-hover class to parent for remove button visibility
        elementDiv.classList.add('group');


        const valueDisplay = document.createElement('div');
        valueDisplay.id = `scada-value-${node.id}`;
        valueDisplay.className = 'scada-value font-bold text-lg mb-1'; // Reduced font size for compactness

        const nameLabel = document.createElement('div');
        nameLabel.className = 'scada-label text-sm text-gray-700 dark:text-gray-300 truncate w-full px-1 text-center';
        nameLabel.textContent = node.name;
        nameLabel.title = node.name;

        if (node.type === 'switch') {
            elementDiv.classList.add('scada-switch');
            const switchSquare = document.createElement('div');
            switchSquare.className = 'w-12 h-12 rounded-md flex items-center justify-center'; // Square for switch
            switchSquare.id = `scada-square-${node.id}`;
            
            // Initial color based on value
            switchSquare.style.backgroundColor = (node.value === 'True' || node.value === true) ? '#10b981' : '#ef4444'; // Green for True, Red for False

            switchSquare.addEventListener('click', async () => {
                const newValue = !(node.value === 'True' || node.value === true);
                const result = await sendData(`${API_BASE}/node_value/${node.node_ua_id}`, 'POST', { value: newValue, type: node.type });
                if (result) {
                    node.value = newValue; // Update local state
                    switchSquare.style.backgroundColor = newValue ? '#10b981' : '#ef4444';
                    showMessageBox(`Node ${node.name} updated to ${newValue}`, 'success');
                }
            });
            elementDiv.appendChild(switchSquare);
            elementDiv.appendChild(nameLabel); // Label below the square
        } else { // type === 'text'
            elementDiv.classList.add('scada-text');
            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'w-full p-1 border rounded-md text-center text-gray-800 dark:bg-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';
            textInput.value = node.value !== null ? node.value : '';
            textInput.placeholder = 'N/A';
            textInput.addEventListener('change', async (e) => {
                const newValue = e.target.value;
                const result = await sendData(`${API_BASE}/node_value/${node.node_ua_id}`, 'POST', { value: newValue, type: node.type });
                if (result) {
                    node.value = newValue; // Update local state
                    showMessageBox(`Node ${node.name} updated to ${newValue}`, 'success');
                }
            });
            elementDiv.appendChild(textInput);
            elementDiv.appendChild(nameLabel); // Label below the text input
        }

        return elementDiv;
    }

    /**
     * Initializes the SCADA page by fetching nodes and layout.
     */
    async function initializeScadaPage() {
        console.log("SCADA: Initializing SCADA page...");
        const configData = await fetchData(`${API_BASE}/config`);
        if (configData) {
            allConfiguredNodes = configData.nodes || [];
            scadaElements = configData.scada_layout || {}; // Ensure scada_layout is initialized from config
            
            console.log("SCADA: Fetched allConfiguredNodes:", allConfiguredNodes);
            console.log("SCADA: Fetched scadaElements (layout):", scadaElements);

            renderAvailableNodes();
            renderScadaDisplay();
            startPolling();
        } else {
            console.error("SCADA: Failed to fetch config data.");
        }
    }

    /**
     * Renders all configured nodes in the left "Available Nodes" pane.
     */
    function renderAvailableNodes() {
        console.log("SCADA: Rendering available nodes. Current allConfiguredNodes:", allConfiguredNodes);
        console.log("SCADA: Current scadaElements (for filtering):", scadaElements);

        availableNodesPane.innerHTML = ''; // Clear existing
        let nodesDisplayedCount = 0;

        if (allConfiguredNodes.length === 0) {
            console.log("SCADA: No configured nodes found. Showing 'no available nodes' message.");
            if (noAvailableNodesMessage) noAvailableNodesMessage.style.display = 'block';
        } else {
            if (noAvailableNodesMessage) noAvailableNodesMessage.style.display = 'none';
            allConfiguredNodes.forEach(node => {
                const isPlaced = !!scadaElements[node.id]; // Check if node is in scadaElements
                console.log(`SCADA: Adding node "${node.name}" (ID: ${node.id}). Is placed: ${isPlaced}.`);
                availableNodesPane.appendChild(renderAvailableNode(node, isPlaced));
                nodesDisplayedCount++;
            });

            // If no nodes are configured at all, show the message
            if (nodesDisplayedCount === 0 && allConfiguredNodes.length === 0) {
                 console.log("SCADA: No nodes configured at all.");
                 if (noAvailableNodesMessage) noAvailableNodesMessage.style.display = 'block';
            } else if (nodesDisplayedCount > 0) {
                 // If there are nodes and some are displayed, hide the message
                 if (noAvailableNodesMessage) noAvailableNodesMessage.style.display = 'none';
            }
        }
    }

    /**
     * Renders SCADA elements in the main display pane based on saved layout.
     */
    function renderScadaDisplay() {
        console.log("SCADA: Rendering SCADA display. Current scadaElements:", scadaElements);
        scadaMainPane.querySelectorAll('.scada-element').forEach(el => el.remove()); // Clear existing
        let hasElements = false;
        for (const nodeId in scadaElements) {
            const layout = scadaElements[nodeId];
            const node = allConfiguredNodes.find(n => n.id === nodeId);
            if (node) {
                console.log(`SCADA: Adding node "${node.name}" (ID: ${node.id}) to main SCADA display.`);
                const scadaEl = renderScadaElement(node, layout.x, layout.y);
                scadaMainPane.appendChild(scadaEl);
                applyScadaInteract(scadaEl);
                hasElements = true;
            } else {
                // If a node in scada_layout no longer exists in config.nodes, remove it from layout
                console.warn(`SCADA: Node with ID ${nodeId} found in scada_layout but not in allConfiguredNodes. Removing from scada_layout.`);
                delete scadaElements[nodeId];
            }
        }
        if (noScadaElementsMessage) noScadaElementsMessage.style.display = hasElements ? 'none' : 'block';
        console.log("SCADA: SCADA display has elements:", hasElements);
    }

    /**
     * Initializes interact.js for draggable SCADA elements within the main pane.
     * @param {HTMLElement} element - The SCADA element to make draggable.
     */
    function applyScadaInteract(element) {
        interact(element)
            .draggable({
                listeners: {
                    start(event) {
                        const target = event.target;
                        target.setAttribute('data-x', (parseFloat(target.getAttribute('data-x')) || 0));
                        target.setAttribute('data-y', (parseFloat(target.getAttribute('data-y')) || 0));
                    },
                    move(event) {
                        const target = event.target;
                        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

                        target.style.left = `${x}px`;
                        target.style.top = `${y}px`;

                        target.setAttribute('data-x', x);
                        target.setAttribute('data-y', y);
                    },
                    end(event) {
                        const nodeId = event.target.getAttribute('data-node-id');
                        const x = parseFloat(event.target.getAttribute('data-x'));
                        const y = parseFloat(event.target.getAttribute('data-y'));
                        scadaElements[nodeId] = { x, y };
                        // Layout will be saved on explicit button click
                    }
                },
                modifiers: [
                    interact.modifiers.restrictRect({
                        restriction: 'parent', // Keep elements within the scadaMainPane
                        endOnly: true
                    }),
                    interact.modifiers.snap({
                        targets: [
                            interact.snappers.grid({ x: 25, y: 25 }) // Snap to a 25x25 grid
                        ],
                        range: Infinity,
                        relativePoints: [{ x: 0, y: 0 }]
                    })
                ]
            });
    }

    /**
     * Handles dropping a node from the available pane to the SCADA display.
     */
    if (scadaMainPane) { // Ensure scadaMainPane exists before attaching dropzone
        console.log("SCADA: scadaMainPane found. Attempting to initialize dropzone with delay."); // New log

        // Add a small delay to ensure scadaMainPane dimensions are computed
        setTimeout(() => {
            interact(scadaMainPane).dropzone({
                accept: '.scada-draggable-node', // Updated to accept the new class
                overlap: 0.75, // Require 75% overlap to be considered a drop

                ondropactivate: function (event) {
                    event.target.classList.add('scada-dropzone-active'); // Use new class
                    console.log("SCADA: Dropzone activated (ondropactivate)."); // Debugging log
                },
                ondragenter: function (event) {
                    const draggableElement = event.relatedTarget;
                    const dropzoneElement = event.target;
                    dropzoneElement.classList.add('bg-blue-100', 'dark:bg-blue-900');
                    console.log("SCADA: Draggable entered dropzone (ondragenter)."); // Debugging log
                },
                ondragleave: function (event) {
                    event.target.classList.remove('bg-blue-100', 'dark:bg-blue-900');
                    console.log("SCADA: Draggable left dropzone (ondragleave)."); // Debugging log
                },
                ondrop: function (event) {
                    const nodeId = event.dataTransfer.getData('text/plain'); // Get data from dragstart
                    const node = allConfiguredNodes.find(n => n.id === nodeId);

                    console.log("SCADA: Node dropped (ondrop). Node ID:", nodeId, "Found node:", node); // Debugging log

                    if (node && !scadaElements[nodeId]) { // Only add if not already present
                        const rect = scadaMainPane.getBoundingClientRect();
                        // Calculate position relative to scadaMainPane
                        const x = event.clientX - rect.left - 50; // Adjust for element width/2 (100px / 2 = 50)
                        const y = event.clientY - rect.top - 50; // Adjust for element height/2 (100px / 2 = 50)

                        scadaElements[nodeId] = { x, y };
                        renderScadaDisplay(); // Re-render to show new element
                        renderAvailableNodes(); // Re-render available nodes to grey out the dropped one
                        showMessageBox(`Node "${node.name}" added to SCADA display.`, 'success');
                    } else if (node && scadaElements[nodeId]) {
                        showMessageBox(`Node "${node.name}" is already on the SCADA display.`, 'info');
                    }
                },
                ondropdeactivate: function (event) {
                    event.target.classList.remove('scada-dropzone-active', 'bg-blue-100', 'dark:bg-blue-900'); // Remove new class and other classes
                    console.log("SCADA: Dropzone deactivated (ondropdeactivate)."); // Debugging log
                }
            });
        }, 100); // 100ms delay
    } else {
        console.warn("SCADA: scadaMainPane not found. Drag and drop functionality will be limited.");
    }


    /**
     * Saves the current SCADA layout.
     */
    if (saveScadaLayoutBtn) { // Ensure button exists before attaching listener
        saveScadaLayoutBtn.addEventListener('click', async () => {
            console.log("SCADA: Saving SCADA layout. Current layout:", scadaElements);
            const result = await sendData(`${API_BASE}/scada_layout`, 'POST', scadaElements);
            if (result) {
                showMessageBox('SCADA Layout saved successfully!', 'success');
            }
        });
    } else {
        console.warn("SCADA: saveScadaLayoutBtn not found. Save functionality will be disabled.");
    }


    /**
     * Periodically polls OPC UA node values for SCADA elements.
     */
    let pollingIntervalId;
    async function startPolling() {
        if (pollingIntervalId) clearInterval(pollingIntervalId); // Clear any existing interval

        // Initial read immediately
        await readAllScadaNodeValues();

        pollingIntervalId = setInterval(async () => {
            await readAllScadaNodeValues();
        }, POLLING_INTERVAL);
    }

    /**
     * Reads values for all nodes currently on the SCADA display and updates their UI.
     */
    async function readAllScadaNodeValues() {
        console.log("SCADA: Polling for node values...");
        // Ensure allConfiguredNodes is up-to-date before polling
        const currentConfig = await fetchData(`${API_BASE}/config`);
        if (currentConfig) {
            allConfiguredNodes = currentConfig.nodes || [];
        }

        for (const nodeId in scadaElements) {
            const node = allConfiguredNodes.find(n => n.id === nodeId);
            if (!node) {
                console.warn(`SCADA: Node with ID ${nodeId} found in scada_layout but not in allConfiguredNodes. Skipping value read.`);
                // Optionally remove from scadaElements if it's no longer configured
                // delete scadaElements[nodeId]; // This might cause layout changes if done automatically
                continue; // Skip if node no longer exists in configured nodes
            }

            try {
                const response = await fetch(`${API_BASE}/node_value/${node.node_ua_id}`);
                const data = await response.json();
                if (response.ok) {
                    node.value = data.value; // Update local node object
                    const scadaElement = document.getElementById(`scada-element-${node.id}`);
                    if (scadaElement) {
                        if (node.type === 'switch') {
                            const switchSquare = document.getElementById(`scada-square-${node.id}`);
                            if (switchSquare) {
                                const isTrue = (data.value === 'True' || data.value === true);
                                switchSquare.style.backgroundColor = isTrue ? '#10b981' : '#ef4444';
                                console.log(`SCADA: Updated switch node "${node.name}" to ${data.value}.`);
                            }
                        } else { // text type
                            const textInput = scadaElement.querySelector('input[type="text"]');
                            if (textInput) {
                                textInput.value = data.value;
                                console.log(`SCADA: Updated text node "${node.name}" to ${data.value}.`);
                            }
                        }
                    }
                } else {
                    console.error(`SCADA: Error reading SCADA node ${node.node_ua_id}: ${data.error}`);
                    // Optionally indicate error state on SCADA element
                    const scadaElement = document.getElementById(`scada-element-${node.id}`);
                    if (scadaElement) {
                        scadaElement.style.border = '2px solid orange'; // Indicate error
                    }
                }
            } catch (error) {
                console.error(`SCADA: Network error reading SCADA node ${node.node_ua_id}:`, error);
                // Optionally indicate offline state on SCADA element
                const scadaElement = document.getElementById(`scada-element-${node.id}`);
                if (scadaElement) {
                    scadaElement.style.border = '2px solid red'; // Indicate offline
                }
            }
        }
    }

    // Initialize the SCADA page on load
    initializeScadaPage();
});
