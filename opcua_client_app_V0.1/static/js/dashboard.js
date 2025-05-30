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
        console.log(`Showing message: ${message} (${type})`); // Added logging for visibility

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
            console.log(`Sending API request: ${method} ${url}`, data || ''); // Added logging
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
                console.error(`API response error for ${url}:`, result); // Log full error response
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            console.log(`API response success for ${url}:`, result); // Log success response
            return result;
        } catch (error) {
            console.error(`API ${method} request to ${url} error:`, error);
            showMessageBox(`Error: ${error.message}`, 'error');
            return null;
        }
    }

    // --- Dashboard Specific Logic ---
    const dashboardContainer = document.getElementById('dashboard-container');
    const noElementsMessage = document.getElementById('no-elements-message');
    const addNodeBtn = document.getElementById('addNodeBtn');
    const addGroupBtn = document.getElementById('addGroupBtn');
    const saveLayoutBtn = document.getElementById('saveLayoutBtn');
    const settingsBtn = document.getElementById('settingsBtn'); 

    // Modals and Forms
    const nodeModal = document.getElementById('nodeModal');
    const nodeForm = document.getElementById('nodeForm');
    // Ensure close buttons are correctly selected, assuming they are direct children of modal-content
    const nodeModalCloseBtn = nodeModal ? nodeModal.querySelector('.modal-content .close-button') : null; 

    const groupModal = document.getElementById('groupModal');
    const groupForm = document.getElementById('groupForm');
    const groupModalCloseBtn = groupModal ? groupModal.querySelector('.modal-content .close-button') : null; 

    const settingsModal = document.getElementById('settingsModal');
    const settingsModalCloseBtn = settingsModal ? settingsModal.querySelector('.modal-content .close-button') : null; 

    // Form inputs for Node Modal (nodeServerSelect is removed)
    const nodeNameInput = document.getElementById('nodeName');
    const nodeTypeSelect = document.getElementById('nodeType');
    const nodeSizeSelect = document.getElementById('nodeSize');
    const nodeUaIdInput = document.getElementById('nodeUaId');
    const nodeUnitInput = document.getElementById('nodeUnit');
    const nodeGroupSelect = document.getElementById('nodeGroup');


    let allNodes = [];
    let allGroups = [];
    let currentLayout = {}; // Stores { id: {x, y, zIndex} }

    // --- Modal Open/Close Handlers ---
    function openModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove('hidden');
            modalElement.classList.add('flex'); // Use flex to center
            console.log(`${modalElement.id} opened.`);
        } else {
            console.warn("Attempted to open a null modal element.");
        }
    }

    function closeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.add('hidden');
            modalElement.classList.remove('flex');
            console.log(`${modalElement.id} closed.`);
        } else {
            console.warn("Attempted to close a null modal element.");
        }
    }

    // --- Event Listeners for Dashboard Buttons ---
    if (addNodeBtn) {
        addNodeBtn.addEventListener('click', async () => {
            console.log("Add Node button clicked.");
            nodeForm.reset();
            document.getElementById('nodeId').value = '';
            document.getElementById('nodeModalTitle').textContent = 'Add New Node';
            await populateGroupDropdown();
            openModal(nodeModal);
        });
    }

    if (nodeModalCloseBtn) {
        nodeModalCloseBtn.addEventListener('click', () => {
            console.log("Node modal close button clicked.");
            closeModal(nodeModal);
        });
    }
    if (nodeModal) {
        nodeModal.addEventListener('click', (e) => {
            if (e.target === nodeModal) { // Close if clicked on the backdrop
                console.log("Node modal backdrop clicked.");
                closeModal(nodeModal);
            }
        });
    }

    if (nodeForm) {
        nodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Node form submitted.");
            const formData = new FormData(nodeForm);
            const nodeData = Object.fromEntries(formData.entries());

            nodeData.x = 0;
            nodeData.y = 0;

            const result = await sendApiRequest(`${API_BASE}/nodes`, 'POST', nodeData);
            if (result) {
                showMessageBox('Node added successfully!', 'success');
                closeModal(nodeModal);
                await fetchAndRenderElements();
            } else {
                showMessageBox('Failed to add node.', 'error');
            }
        });
    }

    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', () => {
            console.log("Add Group button clicked.");
            groupForm.reset();
            document.getElementById('groupId').value = '';
            document.getElementById('groupModalTitle').textContent = 'Add New Group';
            openModal(groupModal);
        });
    }

    if (groupModalCloseBtn) {
        groupModalCloseBtn.addEventListener('click', () => {
            console.log("Group modal close button clicked.");
            closeModal(groupModal);
        });
    }
    if (groupModal) {
        groupModal.addEventListener('click', (e) => {
            if (e.target === groupModal) { // Close if clicked on the backdrop
                console.log("Group modal backdrop clicked.");
                closeModal(groupModal);
            }
        });
    }

    if (groupForm) {
        groupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Group form submitted.");
            const formData = new FormData(groupForm);
            const groupData = Object.fromEntries(formData.entries());

            groupData.x = 0;
            groupData.y = 0;

            const result = await sendApiRequest(`${API_BASE}/groups`, 'POST', groupData);
            if (result) {
                showMessageBox('Group added successfully!', 'success');
                closeModal(groupModal);
                await fetchAndRenderElements();
            } else {
                showMessageBox('Failed to add group.', 'error');
            }
        });
    }

    if (saveLayoutBtn) {
        saveLayoutBtn.addEventListener('click', async () => {
            console.log("Save Layout button clicked.");
            const layoutToSave = {};
            document.querySelectorAll('.draggable-node').forEach(nodeEl => {
                const nodeId = nodeEl.dataset.id;
                layoutToSave[nodeId] = {
                    x: parseFloat(nodeEl.style.left) || 0,
                    y: parseFloat(nodeEl.style.top) || 0
                };
            });
            document.querySelectorAll('.draggable-group').forEach(groupEl => {
                const groupId = groupEl.dataset.id;
                layoutToSave[groupId] = {
                    x: parseFloat(groupEl.style.left) || 0,
                    y: parseFloat(groupEl.style.top) || 0
                };
            });

            const result = await sendApiRequest(`${API_BASE}/layout`, 'POST', layoutToSave);
            if (result) {
                showMessageBox('Layout saved successfully!', 'success');
            } else {
                showMessageBox('Failed to save layout.', 'error');
            }
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            console.log("Settings button clicked.");
            openModal(settingsModal);
        });
    }

    if (settingsModalCloseBtn) {
        settingsModalCloseBtn.addEventListener('click', () => {
            console.log("Settings modal close button clicked.");
            closeModal(settingsModal);
        });
    }
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) { // Close if clicked on the backdrop
                console.log("Settings modal backdrop clicked.");
                closeModal(settingsModal);
            }
        });
    }

    // --- Data Fetching and Rendering ---

    async function populateGroupDropdown() {
        const groupSelect = document.getElementById('nodeGroup');
        if (!groupSelect) {
            console.warn("nodeGroup select element not found.");
            return;
        }

        groupSelect.innerHTML = '<option value="">-- No Group --</option>';
        const groups = await sendApiRequest(`${API_BASE}/groups`, 'GET');
        if (groups && groups.length > 0) {
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.title;
                groupSelect.appendChild(option);
            });
        }
    }

    function renderNodeCard(node) {
        const nodeEl = document.createElement('div');
        nodeEl.id = `node-${node.id}`;
        nodeEl.dataset.id = node.id;
        nodeEl.dataset.type = node.type;
        nodeEl.dataset.uaId = node.node_ua_id;
        nodeEl.dataset.serverId = node.server_id;
        // Removed the empty string from classList.add()
        nodeEl.classList.add(
            'draggable-node', 'absolute', 'p-4' 
        );

        let sizeClasses = '';
        switch (node.size) {
            case 'small':
                sizeClasses = 'w-[150px] h-[100px] text-sm';
                break;
            case 'medium':
                sizeClasses = 'w-[200px] h-[120px] text-base';
                break;
            case 'large':
                sizeClasses = 'w-[250px] h-[150px] text-lg';
                break;
            default:
                sizeClasses = 'w-[180px] h-[110px] text-base';
        }
        nodeEl.classList.add(sizeClasses,
            'rounded-lg', 'shadow-md', 'bg-gray-100', 'dark:bg-gray-700',
            'text-gray-800', 'dark:text-gray-100', 'border', 'border-gray-300', 'dark:border-gray-600',
            'cursor-grab', 'z-10', 'flex', 'flex-col', 'justify-between', 'items-center'
        );

        nodeEl.style.left = `${node.x || 0}px`;
        nodeEl.style.top = `${node.y || 0}px`;

        const nodeValue = node.value !== undefined && node.value !== null ? node.value : 'N/A';
        const unit = node.unit ? ` ${node.unit}` : '';

        let valueDisplayHtml = '';
        if (node.type === 'switch') {
            valueDisplayHtml = `
                <label class="switch">
                    <input type="checkbox" class="node-switch-input" data-ua-id="${node.node_ua_id}">
                    <span class="slider round"></span>
                </label>
            `;
        } else if (node.type === 'text' || node.type === 'gauge' || node.type === 'chart') {
             valueDisplayHtml = `<div class="text-2xl font-semibold text-blue-600 dark:text-blue-400 node-value truncate">${nodeValue}${unit}</div>`;
        }

        nodeEl.innerHTML = `
            <div class="font-bold text-lg mb-1 truncate w-full px-2 pt-1">${node.name}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 truncate w-full px-2" title="${node.node_ua_id}">${node.node_ua_id}</div>
            <div class="flex-grow flex items-center justify-center w-full">
                ${valueDisplayHtml}
            </div>
            <button class="delete-node-btn absolute top-1 right-1 text-red-500 hover:text-red-700 text-sm opacity-75 hover:opacity-100" data-id="${node.id}">
                <i class="fas fa-times-circle"></i>
            </button>
        `;

        nodeEl.querySelector('.delete-node-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmModal = document.getElementById('confirmModal');
            const confirmMessage = document.getElementById('confirmMessage');
            const confirmYesBtn = document.getElementById('confirmYes');
            const confirmNoBtn = document.getElementById('confirmNo');

            confirmMessage.textContent = `Are you sure you want to delete node "${node.name}"?`;
            openModal(confirmModal);

            confirmYesBtn.onclick = async () => {
                const result = await sendApiRequest(`${API_BASE}/nodes/${node.id}`, 'DELETE');
                if (result) {
                    showMessageBox('Node deleted successfully!', 'success');
                    nodeEl.remove();
                    allNodes = allNodes.filter(n => n.id !== node.id);
                    checkNoElementsMessage();
                } else {
                    showMessageBox('Failed to delete node.', 'error');
                }
                closeModal(confirmModal);
            };
            confirmNoBtn.onclick = () => closeModal(confirmModal);
        });

        if (node.type === 'switch') {
            const switchInput = nodeEl.querySelector('.node-switch-input');
            if (switchInput) {
                switchInput.checked = (node.value === 'True' || node.value === true);
                switchInput.addEventListener('change', async () => {
                    const newValue = switchInput.checked;
                    const result = await sendApiRequest(`${API_BASE}/node_value/${node.node_ua_id}`, 'POST', { value: newValue, type: 'switch' });
                    if (result) {
                        showMessageBox(`Node ${node.name} switch set to ${newValue}`, 'info');
                        node.value = newValue;
                    } else {
                        switchInput.checked = !newValue;
                    }
                });
            }
        }

        dashboardContainer.appendChild(nodeEl);
        makeDraggable(nodeEl);
    }

    function renderGroupSection(group) {
        const groupEl = document.createElement('div');
        groupEl.id = `group-${group.id}`;
        groupEl.dataset.id = group.id;
        groupEl.classList.add(
            'draggable-group', 'absolute', 'p-4', 'border-2', 'border-purple-400', 'dark:border-purple-600',
            'min-w-[200px]', 'min-h-[150px]', 'cursor-grab', 'relative', 'z-0'
        );

        let sizeClasses = '';
        switch (group.size) {
            case 'small':
                sizeClasses = 'w-[250px] h-[180px]';
                break;
            case 'medium':
                sizeClasses = 'w-[350px] h-[250px]';
                break;
            case 'large':
                sizeClasses = 'w-[450px] h-[320px]';
                break;
            default:
                sizeClasses = 'w-[300px] h-[200px]';
        }
        groupEl.classList.add(sizeClasses,
            'rounded-lg', 'shadow-md', 'bg-purple-100', 'dark:bg-purple-900'
        );

        groupEl.style.left = `${group.x || 0}px`;
        groupEl.style.top = `${group.y || 0}px`;

        groupEl.innerHTML = `
            <h3 class="font-bold text-xl mb-2 text-purple-800 dark:text-purple-200 group-title">${group.title}</h3>
            <div class="group-nodes-container flex flex-wrap gap-2">
            </div>
            <button class="delete-group-btn absolute top-1 right-1 text-red-500 hover:text-red-700 text-sm opacity-75 hover:opacity-100" data-id="${group.id}">
                <i class="fas fa-times-circle"></i>
            </button>
        `;
        
        groupEl.querySelector('.delete-group-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmModal = document.getElementById('confirmModal');
            const confirmMessage = document.getElementById('confirmMessage');
            const confirmYesBtn = document.getElementById('confirmYes');
            const confirmNoBtn = document.getElementById('confirmNo');

            confirmMessage.textContent = `Are you sure you want to delete group "${group.title}"? This will also unassign nodes.`;
            openModal(confirmModal);

            confirmYesBtn.onclick = async () => {
                const result = await sendApiRequest(`${API_BASE}/groups/${group.id}`, 'DELETE');
                if (result) {
                    showMessageBox('Group deleted successfully!', 'success');
                    groupEl.remove();
                    allGroups = allGroups.filter(g => g.id !== group.id);
                    await fetchAndRenderElements();
                    checkNoElementsMessage();
                } else {
                    showMessageBox('Failed to delete group.', 'error');
                }
                closeModal(confirmModal);
            };
            confirmNoBtn.onclick = () => closeModal(confirmModal);
        });

        dashboardContainer.appendChild(groupEl);
        makeDraggable(groupEl);
    }

    // --- Basic Drag and Drop Functionality ---
    let activeDraggable = null;
    let initialX, initialY;
    let xOffset = 0, yOffset = 0;

    function makeDraggable(element) {
        element.addEventListener('mousedown', dragStart);
        element.addEventListener('touchstart', dragStart, {passive: true});
    }

    function dragStart(e) {
        if (e.target.closest('.delete-node-btn') || e.target.closest('.delete-group-btn') || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' || e.target.closest('.switch')) {
            return; // Don't drag if interacting with controls
        }

        activeDraggable = e.currentTarget;
        activeDraggable.style.zIndex = 100;

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
            activeDraggable.style.zIndex = activeDraggable.classList.contains('draggable-node') ? 10 : 0;
        }
        activeDraggable = null;
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('touchend', dragEnd);
        document.removeEventListener('touchmove', drag);
    }

    // --- Main Rendering Function ---
    async function fetchAndRenderElements() {
        if (!dashboardContainer) return;

        dashboardContainer.innerHTML = '';
        const config = await sendApiRequest(`${API_BASE}/config`, 'GET');
        if (!config) return;

        allNodes = config.nodes || [];
        allGroups = config.groups || [];
        currentLayout = config.layout || {};

        allGroups.forEach(group => {
            if (currentLayout[group.id]) {
                group.x = currentLayout[group.id].x;
                group.y = currentLayout[group.id].y;
            }
            renderGroupSection(group);
        });

        allNodes.forEach(node => {
            if (currentLayout[node.id]) {
                node.x = currentLayout[node.id].x;
                node.y = currentLayout[node.id].y;
            }
            renderNodeCard(node);
        });

        checkNoElementsMessage();
    }

    function checkNoElementsMessage() {
        if (noElementsMessage) {
            if (allNodes.length === 0 && allGroups.length === 0) {
                noElementsMessage.classList.remove('hidden');
            } else {
                noElementsMessage.classList.add('hidden');
            }
        }
    }

    // --- Live Data Polling ---
    async function updateNodeValues() {
        const config = await sendApiRequest(`${API_BASE}/config`, 'GET');
        if (config && config.nodes) {
            config.nodes.forEach(node => {
                const nodeEl = document.getElementById(`node-${node.id}`);
                if (nodeEl) {
                    const valueEl = nodeEl.querySelector('.node-value');
                    const switchInput = nodeEl.querySelector('.node-switch-input');

                    if (valueEl) {
                        const unit = node.unit ? ` ${node.unit}` : '';
                        valueEl.textContent = `${node.value !== undefined && node.value !== null ? node.value : 'N/A'}${unit}`;
                    }
                    if (switchInput) {
                        if (document.activeElement !== switchInput) {
                             switchInput.checked = (node.value === 'True' || node.value === true);
                        }
                    }
                }
            });
        }
    }

    // --- Settings Modal Logic ---
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValueSpan = document.getElementById('fontSizeValue');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const primaryColorPicker = document.getElementById('primaryColorPicker');
    const secondaryColorPicker = document.getElementById('secondaryColorPicker');
    const textColorPicker = document.getElementById('textColorPicker');
    const bgColorPicker = document.getElementById('bgColorPicker');
    const cardBgColorPicker = document.getElementById('cardBgColorPicker');

    function loadSettings() {
        const savedFontSize = localStorage.getItem('fontSize');
        if (fontSizeSlider && fontSizeValueSpan && savedFontSize) {
            fontSizeSlider.value = savedFontSize;
            fontSizeValueSpan.textContent = `${savedFontSize}px`;
            document.documentElement.style.fontSize = `${savedFontSize}px`;
        }

        const savedDarkMode = localStorage.getItem('darkMode');
        if (darkModeToggle && savedDarkMode === 'enabled') {
            darkModeToggle.checked = true;
            document.body.classList.add('dark-mode');
        }

        const savedPrimaryColor = localStorage.getItem('primaryColor');
        if (primaryColorPicker && savedPrimaryColor) {
            primaryColorPicker.value = savedPrimaryColor;
            document.documentElement.style.setProperty('--primary-color', savedPrimaryColor);
        }

        const savedSecondaryColor = localStorage.getItem('secondaryColor');
        if (secondaryColorPicker && savedSecondaryColor) {
            secondaryColorPicker.value = savedSecondaryColor;
            document.documentElement.style.setProperty('--secondary-color', savedSecondaryColor);
        }

        const savedTextColor = localStorage.getItem('textColor');
        if (textColorPicker && savedTextColor) {
            textColorPicker.value = savedTextColor;
            document.documentElement.style.setProperty('--text-color', savedTextColor);
        }

        const savedBgColor = localStorage.getItem('bgColor');
        if (bgColorPicker && savedBgColor) {
            bgColorPicker.value = savedBgColor;
            document.documentElement.style.setProperty('--bg-color', savedBgColor);
        }

        const savedCardBgColor = localStorage.getItem('cardBgColor');
        if (cardBgColorPicker && savedCardBgColor) {
            cardBgColorPicker.value = savedCardBgColor;
            document.documentElement.style.setProperty('--card-bg-color', savedCardBgColor);
        }
    }

    function saveSetting(key, value) {
        localStorage.setItem(key, value);
    }

    if (fontSizeSlider && fontSizeValueSpan) {
        fontSizeSlider.addEventListener('input', (e) => {
            const size = e.target.value;
            fontSizeValueSpan.textContent = `${size}px`;
            document.documentElement.style.fontSize = `${size}px`;
            saveSetting('fontSize', size);
        });
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', () => {
            if (darkModeToggle.checked) {
                document.body.classList.add('dark-mode');
                saveSetting('darkMode', 'enabled');
            } else {
                document.body.classList.remove('dark-mode');
                saveSetting('darkMode', 'disabled');
            }
        });
    }

    if (primaryColorPicker) {
        primaryColorPicker.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--primary-color', e.target.value);
            saveSetting('primaryColor', e.target.value);
        });
    }
    if (secondaryColorPicker) {
        secondaryColorPicker.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--secondary-color', e.target.value);
            saveSetting('secondaryColor', e.target.value);
        });
    }
    if (textColorPicker) {
        textColorPicker.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--text-color', e.target.value);
            saveSetting('textColor', e.target.value);
        });
    }
    if (bgColorPicker) {
        bgColorPicker.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--bg-color', e.target.value);
            saveSetting('bgColor', e.target.value);
        });
    }
    if (cardBgColorPicker) {
        cardBgColorPicker.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--card-bg-color', e.target.value);
            saveSetting('cardBgColor', e.target.value);
        });
    }

    loadSettings();

    // --- Initialize Dashboard ---
    if (dashboardContainer) {
        fetchAndRenderElements();
        setInterval(updateNodeValues, 2000);
    }
});
