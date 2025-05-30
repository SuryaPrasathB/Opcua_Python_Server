document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = '/api';

    // --- Common Message Box Function (Copied from main.js) ---
    function showMessageBox(message, type = 'info') {
        const messageBox = document.getElementById('messageBox');
        const messageText = document.getElementById('messageText');

        if (!messageBox || !messageText) {
            console.warn("MessageBox elements not found. Cannot display message:", message);
            return;
        }

        messageText.textContent = message;
        messageBox.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl z-20 transition-all duration-300 ease-in-out transform';

        // Reset classes
        messageBox.classList.remove('bg-green-600', 'bg-red-600', 'bg-gray-800', 'hidden', 'translate-x-full');

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

        messageBox.classList.add('translate-x-0'); // Show

        setTimeout(() => {
            messageBox.classList.remove('translate-x-0');
            messageBox.classList.add('translate-x-full'); // Hide
            setTimeout(() => {
                messageBox.classList.add('hidden');
                messageBox.className = 'fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-xl z-20 hidden'; // Reset for next use
            }, 300);
        }, 3000);
    }

    // --- Helper for API calls (Copied from main.js) ---
    async function sendApiRequest(url, method, data = null) {
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
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            return result;
        } catch (error) {
            console.error(`API ${method} request to ${url} error:`, error);
            showMessageBox(`Error: ${error.message}`, 'error');
            return null;
        }
    }

    // --- SCADA Specific Logic ---
    const scadaMainPane = document.getElementById('scada-main-pane');
    const addScadaElementBtn = document.getElementById('addScadaElementBtn');
    const saveScadaLayoutBtn = document.getElementById('saveScadaLayoutBtn');

    const addScadaElementModal = document.getElementById('addScadaElementModal');
    const addScadaElementForm = document.getElementById('addScadaElementForm');
    const cancelAddScadaElementBtn = document.getElementById('cancelAddScadaElementBtn');
    const scadaNodeSelect = document.getElementById('scadaNodeSelect');

    let allScadaElements = []; // This will store the SCADA elements from config.scada_layout
    let allNodes = []; // To store all nodes for dropdown population

    // --- Event Listeners for SCADA Buttons ---
    if (addScadaElementBtn) {
        addScadaElementBtn.addEventListener('click', async () => {
            await populateScadaNodeDropdown();
            addScadaElementModal.classList.remove('hidden');
        });

        cancelAddScadaElementBtn.addEventListener('click', () => {
            addScadaElementModal.classList.add('hidden');
            addScadaElementForm.reset();
        });

        addScadaElementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(addScadaElementForm);
            const elementData = Object.fromEntries(formData.entries());

            // Find the node_ua_id and type for the selected node_id
            const selectedNode = allNodes.find(node => node.id === elementData.node_id);
            if (selectedNode) {
                elementData.node_ua_id = selectedNode.node_ua_id;
                elementData.node_name = selectedNode.name; // Store node name for display
                // The 'type' of the SCADA element is already in elementData.element_type
            } else {
                showMessageBox('Selected node not found!', 'error');
                return;
            }

            // Generate a unique ID for the SCADA element
            elementData.id = `scada-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            elementData.x = 0; // Default position
            elementData.y = 0; // Default position

            // Add the new element to the local array and save to backend
            allScadaElements.push(elementData);
            const result = await sendApiRequest(`${API_BASE}/scada_layout`, 'POST', allScadaElements); // Send entire layout
            if (result) {
                showMessageBox('SCADA element added successfully!', 'success');
                addScadaElementModal.classList.add('hidden');
                addScadaElementForm.reset();
                await fetchAndRenderScadaElements(); // Re-render to show new element
            }
        });
    }

    if (saveScadaLayoutBtn) {
        saveScadaLayoutBtn.addEventListener('click', async () => {
            const layoutToSave = {};
            document.querySelectorAll('.scada-element').forEach(elementEl => {
                const elementId = elementEl.id; // Use the element's ID directly
                layoutToSave[elementId] = {
                    x: parseFloat(elementEl.style.left) || 0,
                    y: parseFloat(elementEl.style.top) || 0,
                    // Store any other relevant properties like width, height, etc. if you add them
                };
            });

            // Merge positions into existing allScadaElements, or create a new structure
            const updatedScadaElements = allScadaElements.map(element => {
                if (layoutToSave[element.id]) {
                    return { ...element, ...layoutToSave[element.id] };
                }
                return element;
            });
            
            const result = await sendApiRequest(`${API_BASE}/scada_layout`, 'POST', updatedScadaElements);
            if (result) {
                showMessageBox('SCADA layout saved successfully!', 'success');
            }
        });
    }

    // --- Data Fetching and Rendering ---

    async function populateScadaNodeDropdown() {
        scadaNodeSelect.innerHTML = '<option value="">Select a node</option>'; // Clear existing
        const nodes = await sendApiRequest(`${API_BASE}/nodes`, 'GET');
        allNodes = nodes || []; // Store all nodes for later lookup
        if (allNodes.length > 0) {
            allNodes.forEach(node => {
                const option = document.createElement('option');
                option.value = node.id; // Use internal node ID
                option.textContent = node.name || node.node_ua_id;
                scadaNodeSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No nodes configured.";
            option.disabled = true;
            scadaNodeSelect.appendChild(option);
            showMessageBox('No nodes configured. Please add them via the Dashboard.', 'info');
        }
    }

    function renderScadaElement(element) {
        const elementEl = document.createElement('div');
        elementEl.id = element.id;
        elementEl.dataset.nodeId = element.node_id;
        elementEl.dataset.uaId = element.node_ua_id;
        elementEl.dataset.elementType = element.element_type;
        elementEl.classList.add(
            'scada-element', 'absolute', 'p-3', 'rounded-lg', 'shadow-md',
            'min-w-[120px]', 'text-center', 'z-10'
        );
        elementEl.style.left = `${element.x || 0}px`;
        elementEl.style.top = `${element.y || 0}px`;

        let innerHtml = `<div class="scada-label font-semibold text-sm mb-1">${element.label || element.node_name}</div>`;
        let valueDisplay = `<div class="scada-value text-xl font-bold">N/A</div>`;

        switch (element.element_type) {
            case 'value_display':
            case 'gauge': // For gauge, we'll just show value for now, full gauge needs a library
                innerHtml += valueDisplay;
                break;
            case 'switch':
                innerHtml += `
                    <label class="switch">
                        <input type="checkbox" class="scada-switch-input" data-ua-id="${element.node_ua_id}">
                        <span class="slider round"></span>
                    </label>
                `;
                break;
            case 'text_input':
                innerHtml += `
                    <input type="text" class="scada-text-input w-full p-1 border rounded" placeholder="Enter value" data-ua-id="${element.node_ua_id}">
                    <button class="scada-text-send-btn mt-2 bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 px-2 rounded">Set</button>
                `;
                break;
        }
        elementEl.innerHTML = innerHtml;

        // Add delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('delete-scada-element-btn', 'absolute', 'top-1', 'right-1', 'text-red-500', 'hover:text-red-700', 'text-sm', 'opacity-75', 'hover:opacity-100');
        deleteBtn.innerHTML = '<i class="fas fa-times-circle"></i>';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete this SCADA element?`)) {
                allScadaElements = allScadaElements.filter(el => el.id !== element.id);
                const result = await sendApiRequest(`${API_BASE}/scada_layout`, 'POST', allScadaElements);
                if (result) {
                    showMessageBox('SCADA element deleted successfully!', 'success');
                    elementEl.remove();
                }
            }
        });
        elementEl.appendChild(deleteBtn);

        scadaMainPane.appendChild(elementEl);
        makeDraggable(elementEl);

        // Add specific event listeners for interactive elements
        if (element.element_type === 'switch') {
            const switchInput = elementEl.querySelector('.scada-switch-input');
            if (switchInput) {
                switchInput.checked = (element.value === 'True' || element.value === true); // Set initial state
                switchInput.addEventListener('change', async () => {
                    const newValue = switchInput.checked;
                    await sendApiRequest(`${API_BASE}/node_value/${element.node_ua_id}`, 'POST', { value: newValue, type: 'switch' });
                    showMessageBox(`Switch for ${element.node_name} set to ${newValue}`, 'info');
                });
            }
        } else if (element.element_type === 'text_input') {
            const textInput = elementEl.querySelector('.scada-text-input');
            const sendBtn = elementEl.querySelector('.scada-text-send-btn');
            if (sendBtn && textInput) {
                sendBtn.addEventListener('click', async () => {
                    const newValue = textInput.value;
                    await sendApiRequest(`${API_BASE}/node_value/${element.node_ua_id}`, 'POST', { value: newValue, type: 'text' });
                    showMessageBox(`Text for ${element.node_name} set to "${newValue}"`, 'info');
                });
            }
        }
    }

    // --- Basic Drag and Drop Functionality (Copied from dashboard.js) ---
    let activeDraggable = null;
    let initialX, initialY;
    let xOffset = 0, yOffset = 0;

    function makeDraggable(element) {
        element.addEventListener('mousedown', dragStart);
        element.addEventListener('touchstart', dragStart, {passive: true});
    }

    function dragStart(e) {
        if (e.target.closest('.delete-scada-element-btn')) {
            return; // Don't drag if clicking delete button
        }

        activeDraggable = e.currentTarget;
        activeDraggable.style.zIndex = 100; // Bring to front

        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - activeDraggable.offsetLeft;
            initialY = e.touches[0].clientY - activeDraggable.offsetTop;
        } else {
            initialX = e.clientX - activeDraggable.offsetLeft;
            initialY = e.clientY - activeDraggable.offsetTop;
        }

        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('mousemove', drag);
        document.addEventListener('touchend', dragEnd);
        document.addEventListener('touchmove', drag, {passive: true});
    }

    function drag(e) {
        if (!activeDraggable) return;

        e.preventDefault();

        if (e.type === "touchmove") {
            xOffset = e.touches[0].clientX - initialX;
            yOffset = e.touches[0].clientY - initialY;
        } else {
            xOffset = e.clientX - initialX;
            yOffset = e.clientY - initialY;
        }

        activeDraggable.style.left = `${xOffset}px`;
        activeDraggable.style.top = `${yOffset}px`;
    }

    function dragEnd() {
        if (activeDraggable) {
            activeDraggable.style.zIndex = 10; // Reset z-index
        }
        activeDraggable = null;
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('touchend', dragEnd);
        document.removeEventListener('touchmove', drag);
    }

    async function fetchAndRenderScadaElements() {
        if (!scadaMainPane) return;

        scadaMainPane.innerHTML = ''; // Clear canvas before re-rendering
        const config = await sendApiRequest(`${API_BASE}/config`, 'GET');
        if (!config) return;

        allScadaElements = config.scada_layout || []; // scada_layout is an array of elements now

        if (Array.isArray(allScadaElements)) {
            allScadaElements.forEach(element => {
                renderScadaElement(element);
            });
        } else {
            // If scada_layout is an object (old format), convert it to array
            const elementsArray = Object.values(allScadaElements);
            allScadaElements = elementsArray;
            elementsArray.forEach(element => {
                renderScadaElement(element);
            });
        }

        // Fetch and update values immediately after rendering
        updateScadaElementValues();
    }

    // --- Live Data Polling for SCADA elements ---
    async function updateScadaElementValues() {
        const config = await sendApiRequest(`${API_BASE}/config`, 'GET');
        if (config && config.nodes) {
            const nodesMap = new Map(config.nodes.map(node => [node.id, node])); // Map nodes by ID for quick lookup

            document.querySelectorAll('.scada-element').forEach(elementEl => {
                const nodeId = elementEl.dataset.nodeId;
                const node = nodesMap.get(nodeId);

                if (node) {
                    const valueDisplay = elementEl.querySelector('.scada-value');
                    const switchInput = elementEl.querySelector('.scada-switch-input');
                    const textInput = elementEl.querySelector('.scada-text-input');

                    if (valueDisplay) {
                        valueDisplay.textContent = `${node.value !== undefined && node.value !== null ? node.value : 'N/A'}${node.unit ? ` ${node.unit}` : ''}`;
                    }
                    if (switchInput) {
                        switchInput.checked = (node.value === 'True' || node.value === true);
                    }
                    if (textInput && document.activeElement !== textInput) { // Don't update if user is typing
                        textInput.value = node.value !== undefined && node.value !== null ? node.value : '';
                    }
                }
            });
        }
    }

    // Initialize SCADA page
    if (scadaMainPane) {
        fetchAndRenderScadaElements();
        setInterval(updateScadaElementValues, 2000); // Poll every 2 seconds
    }
});
