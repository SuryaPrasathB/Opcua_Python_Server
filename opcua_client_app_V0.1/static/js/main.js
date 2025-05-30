// Define hideContextMenu in the global scope so it's always available
function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const dashboardContainer = document.getElementById('dashboard-container');
    const addNodeBtn = document.getElementById('addNodeBtn');
    const addGroupBtn = document.getElementById('addGroupBtn');
    const saveLayoutBtn = document.getElementById('saveLayoutBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const noElementsMessage = document.getElementById('no-elements-message');

    // Modals and Forms (Conditional initialization)
    const nodeModal = document.getElementById('nodeModal');
    let nodeForm, nodeIdInput, nodeNameInput, nodeTypeSelect, nodeSizeSelect, nodeUaIdInput, nodeGroupSelect, nodeModalTitle;
    if (nodeModal) {
        nodeForm = document.getElementById('nodeForm');
        nodeIdInput = document.getElementById('nodeId');
        nodeNameInput = document.getElementById('nodeName');
        nodeTypeSelect = document.getElementById('nodeType');
        nodeSizeSelect = document.getElementById('nodeSize');
        nodeUaIdInput = document.getElementById('nodeUaId');
        nodeGroupSelect = document.getElementById('nodeGroup');
        nodeModalTitle = document.getElementById('nodeModalTitle');
    }

    const groupModal = document.getElementById('groupModal');
    let groupForm, groupIdInput, groupTitleInput, groupSizeSelect, groupModalTitle;
    if (groupModal) {
        groupForm = document.getElementById('groupForm');
        groupIdInput = document.getElementById('groupId');
        groupTitleInput = document.getElementById('groupTitle');
        groupSizeSelect = document.getElementById('groupSize');
        groupModalTitle = document.getElementById('groupModalTitle');
    }

    const confirmModal = document.getElementById('confirmModal');
    let confirmMessage, confirmYesBtn, confirmNoBtn;

    // Initialize confirm modal elements and attach handlers only if confirmModal exists
    if (confirmModal) {
        confirmMessage = document.getElementById('confirmMessage');
        confirmYesBtn = document.getElementById('confirmYes');
        confirmNoBtn = document.getElementById('confirmNo');

        if (confirmYesBtn) {
            confirmYesBtn.onclick = () => {
                if (confirmAction) {
                    confirmAction();
                }
                closeModal(confirmModal);
            };
        } else {
            console.warn("main.js: confirmYesBtn not found, cannot assign onclick.");
        }

        if (confirmNoBtn) {
            confirmNoBtn.onclick = () => {
                closeModal(confirmModal);
            };
        } else {
            console.warn("main.js: confirmNoBtn not found, cannot assign onclick.");
        }
    }


    const settingsModal = document.getElementById('settingsModal');
    let fontSizeSlider, fontSizeValueSpan, darkModeToggle, primaryColorPicker, secondaryColorPicker, textColorPicker, bgColorPicker, cardBgColorPicker;
    if (settingsModal) {
        fontSizeSlider = document.getElementById('fontSizeSlider');
        fontSizeValueSpan = document.getElementById('fontSizeValue');
        darkModeToggle = document.getElementById('darkModeToggle');
        primaryColorPicker = document.getElementById('primaryColorPicker');
        secondaryColorPicker = document.getElementById('secondaryColorPicker');
        textColorPicker = document.getElementById('textColorPicker');
        bgColorPicker = document.getElementById('bgColorPicker');
        cardBgColorPicker = document.getElementById('cardBgColorPicker');
    }

    // Context Menu Elements (Conditional initialization)
    const contextMenu = document.getElementById('contextMenu');
    let contextEdit = null; // Initialize to null
    let contextDelete = null; // Initialize to null

    if (contextMenu) { // Only attempt to get children if contextMenu itself is found
        contextEdit = document.getElementById('contextEdit');
        contextDelete = document.getElementById('contextDelete');
        console.log("main.js: contextMenu element found:", contextMenu);
        console.log("main.js: contextEdit element found:", contextEdit);
        console.log("main.js: contextDelete element found:", contextDelete);

        // Assign onclick handlers for context menu items only if they exist
        if (contextEdit) {
            console.log("main.js: Assigning onclick to contextEdit.");
            contextEdit.onclick = () => {
                if (activeElementType === 'node') {
                    editNode(activeElementId);
                } else if (activeElementType === 'group') {
                    editGroup(activeElementId);
                }
                hideContextMenu();
            };
        } else {
            console.warn("main.js: contextEdit element not found, cannot assign onclick.");
        }

        if (contextDelete) {
            console.log("main.js: Assigning onclick to contextDelete.");
            contextDelete.onclick = () => {
                if (activeElementType === 'node') {
                    const nodeElement = document.getElementById(`node-${activeElementId}`);
                    const nodeName = nodeElement ? nodeElement.querySelector('h4')?.textContent : 'this node';
                    showConfirmModal(`Are you sure you want to delete node "${nodeName}"?`, () => deleteNode(activeElementId));
                } else if (activeElementType === 'group') {
                    const groupElement = document.getElementById(`group-${activeElementId}`);
                    const groupName = groupElement ? groupElement.querySelector('h3')?.textContent : 'this group';
                    showConfirmModal(`Are you sure you want to delete group "${groupName}"? All nodes in this group will be unassigned.`, () => deleteGroup(activeElementId));
                }
                hideContextMenu();
            };
        } else {
            console.warn("main.js: contextDelete element not found, cannot assign onclick.");
        }

        // Event listener to hide context menu when clicking anywhere else on the document
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        });

    } else {
        console.warn("main.js: contextMenu element not found. Context menu functionality will be disabled.");
    }

    let activeElementId = null;
    let activeElementType = null;

    // Close buttons for modals (Conditional initialization)
    if (nodeModal) {
        const nodeModalCloseBtn = nodeModal.querySelector('.close-button');
        if (nodeModalCloseBtn) {
            nodeModalCloseBtn.addEventListener('click', () => closeModal(nodeModal));
        }
    }
    if (groupModal) {
        const groupModalCloseBtn = groupModal.querySelector('.close-button');
        if (groupModalCloseBtn) {
            groupModalCloseBtn.addEventListener('click', () => closeModal(groupModal));
        }
    }
    if (settingsModal) {
        const settingsModalCloseBtn = settingsModal.querySelector('.close-button');
        if (settingsModalCloseBtn) {
            settingsModalCloseBtn.addEventListener('click', () => closeModal(settingsModal));
        }
    }


    let currentNodes = [];
    let currentGroups = [];
    let currentLayout = {};
    let confirmAction = null;

    const API_BASE = '/api';
    const POLLING_INTERVAL = 5000;

    const PRESET_SIZES = {
        small: { width: 160, height: 120 },
        medium: { width: 220, height: 150 },
        large: { width: 280, height: 180 }
    };

    const defaultSettings = {
        fontSize: 16,
        darkMode: false,
        primaryColor: '#2563eb',
        secondaryColor: '#10b981',
        textColor: '#1f2937',
        bgColor: '#f3f4f6',
        cardBgColor: '#ffffff'
    };
    let currentSettings = { ...defaultSettings };


    function showMessageBox(message, type = 'info') {
        const messageBox = document.getElementById('messageBox');
        const messageText = document.getElementById('messageText');

        messageText.textContent = message;
        messageBox.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl z-20 transition-all duration-300 ease-in-out transform';

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
                messageBox.className = 'fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-xl z-20 hidden';
            }, 300);
        }, 3000);
    }

    function openModal(modalElement) {
        modalElement.style.display = 'flex';
    }

    function closeModal(modalElement) {
        modalElement.style.display = 'none';
        if (modalElement.id === 'nodeModal' && nodeForm) {
            nodeForm.reset();
            nodeIdInput.value = '';
            nodeModalTitle.textContent = 'Add New Node';
            nodeSizeSelect.value = defaultSettings.nodeSize || 'medium';
        } else if (modalElement.id === 'groupModal' && groupForm) {
            groupForm.reset();
            groupIdInput.value = '';
            groupModalTitle.textContent = 'Add New Group';
            groupSizeSelect.value = defaultSettings.groupSize || 'medium';
        }
    }

    function showConfirmModal(message, onConfirm) {
        if (confirmModal) { // Ensure confirmModal exists before trying to use its children
            confirmMessage.textContent = message;
            confirmAction = onConfirm;
            openModal(confirmModal);
        } else {
            console.error("Confirm modal not found. Cannot show confirmation.");
            // Fallback: execute action directly if modal can't be shown (less safe)
            // if (onConfirm) onConfirm();
        }
    }


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

    function renderNodeCard(node) {
        const card = document.createElement('div');
        card.id = `node-${node.id}`;
        card.className = 'card p-2 bg-white rounded-xl shadow-lg flex flex-col justify-between items-center text-center relative';
        
        const size = PRESET_SIZES[node.size] || PRESET_SIZES.medium;
        card.style.width = `${size.width}px`;
        card.style.height = `${size.height}px`;

        card.style.transform = `translate(${node.x}px, ${node.y}px)`;
        card.setAttribute('data-id', node.id);
        card.setAttribute('data-type', 'node');
        card.setAttribute('data-group-id', node.groupId || '');
        card.setAttribute('data-size', node.size || 'medium');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'card-content flex-grow flex flex-col justify-center items-center w-full min-h-0';

        const nameElem = document.createElement('h4');
        nameElem.className = 'text-base font-semibold text-gray-800 mb-0.5 truncate w-full px-1';
        nameElem.textContent = node.name;
        nameElem.title = node.name;

        const uaIdElem = document.createElement('p');
        uaIdElem.className = 'text-xs text-gray-500 mb-0.5 truncate w-full px-1';
        uaIdElem.textContent = node.node_ua_id;
        uaIdElem.title = node.node_ua_id;

        const valueElem = document.createElement('div');
        valueElem.className = 'value-display text-xl font-bold text-blue-600 mb-0.5';
        valueElem.id = `value-${node.id}`;
        valueElem.textContent = node.value !== null ? node.value : 'N/A';

        let inputElement;
        if (node.type === 'switch') {
            inputElement = document.createElement('label');
            inputElement.className = 'switch';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = node.value === 'True' || node.value === true;
            checkbox.onchange = async (e) => {
                const newValue = e.target.checked;
                const result = await sendData(`${API_BASE}/node_value/${node.node_ua_id}`, 'POST', { value: newValue, type: node.type });
                if (result) {
                    showMessageBox(`Node ${node.name} updated to ${newValue}`, 'success');
                    node.value = newValue;
                    valueElem.textContent = newValue ? 'True' : 'False';
                } else {
                    e.target.checked = !newValue;
                }
            };
            const slider = document.createElement('span');
            slider.className = 'slider round';
            inputElement.appendChild(checkbox);
            inputElement.appendChild(slider);
        } else {
            inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.className = 'w-full p-1 border rounded-md text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';
            inputElement.value = node.value !== null ? node.value : '';
            inputElement.placeholder = 'Enter value';
            inputElement.onchange = async (e) => {
                const newValue = e.target.value;
                const result = await sendData(`${API_BASE}/node_value/${node.node_ua_id}`, 'POST', { value: newValue, type: node.type });
                if (result) {
                    showMessageBox(`Node ${node.name} updated to ${newValue}`, 'success');
                    node.value = newValue;
                }
            };
        }

        contentDiv.appendChild(nameElem);
        contentDiv.appendChild(uaIdElem);
        contentDiv.appendChild(valueElem);
        contentDiv.appendChild(inputElement);

        card.appendChild(contentDiv);

        return card;
    }

    function renderGroupSection(group) {
        const section = document.createElement('div');
        section.id = `group-${group.id}`;
        section.className = 'group-section p-4 rounded-xl shadow-lg relative';
        
        const size = PRESET_SIZES[group.size] || PRESET_SIZES.medium;
        section.style.width = `${size.width * 2}px`;
        section.style.height = `${size.height * 2}px`;

        section.style.transform = `translate(${group.x}px, ${group.y}px)`;
        section.setAttribute('data-id', group.id);
        section.setAttribute('data-type', 'group');
        section.setAttribute('data-size', group.size || 'medium');

        const titleElem = document.createElement('h3');
        titleElem.className = 'group-title text-xl font-bold text-gray-700 mb-2 text-center';
        titleElem.textContent = group.title;
        titleElem.contentEditable = true;
        titleElem.onblur = async (e) => {
            const newTitle = e.target.textContent.trim();
            if (newTitle !== group.title) {
                const result = await sendData(`${API_BASE}/groups`, 'POST', { id: group.id, title: newTitle });
                if (result) {
                    group.title = newTitle;
                    showMessageBox(`Group "${group.title}" updated.`, 'success');
                } else {
                    e.target.textContent = group.title;
                }
            }
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full text-xs transition duration-200';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.onclick = () => showConfirmModal(`Are you sure you want to delete group "${group.title}"? All nodes in this group will be unassigned.`, () => deleteGroup(group.id));

        section.appendChild(titleElem);
        section.appendChild(deleteBtn);

        return section;
    }

    function populateGroupDropdown() {
        if (!nodeGroupSelect) return;
        nodeGroupSelect.innerHTML = '<option value="">-- No Group --</option>';
        currentGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.title;
            nodeGroupSelect.appendChild(option);
        });
    }

    function renderDashboard() {
        if (!dashboardContainer) return;
        dashboardContainer.innerHTML = '';
        if (noElementsMessage) {
            noElementsMessage.style.display = (currentNodes.length === 0 && currentGroups.length === 0) ? 'block' : 'none';
        }

        currentGroups.forEach(group => {
            const groupEl = renderGroupSection(group);
            dashboardContainer.appendChild(groupEl);
            applyInteract(groupEl);
        });

        currentNodes.forEach(node => {
            const nodeEl = renderNodeCard(node);
            dashboardContainer.appendChild(nodeEl);
            applyInteract(nodeEl);
        });
    }

    function applyInteract(element) {
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

                        target.style.transform = `translate(${x}px, ${y}px)`;

                        target.setAttribute('data-x', x);
                        target.setAttribute('data-y', y);
                    },
                    end(event) {
                        const target = event.target;
                        const id = target.getAttribute('data-id');
                        const type = target.getAttribute('data-type');
                        const x = parseFloat(target.getAttribute('data-x'));
                        const y = parseFloat(target.getAttribute('data-y'));

                        if (type === 'node') {
                            const node = currentNodes.find(n => n.id === id);
                            if (node) {
                                node.x = x;
                                node.y = y;
                            }
                        } else if (type === 'group') {
                            const group = currentGroups.find(g => g.id === id);
                            if (group) {
                                group.x = x;
                                group.y = y;
                            }
                        }
                        saveLayout();
                    }
                },
                modifiers: [
                    interact.modifiers.snap({
                        targets: [
                            interact.snappers.grid({ x: 25, y: 25 })
                        ],
                        range: Infinity,
                        relativePoints: [{ x: 0, y: 0 }]
                    }),
                    interact.modifiers.restrictRect({
                        restriction: 'parent'
                    })
                ]
            });
    }

    async function saveLayout() {
        const layoutData = {};
        currentNodes.forEach(node => {
            layoutData[node.id] = { x: node.x, y: node.y, size: node.size };
        });
        currentGroups.forEach(group => {
            layoutData[group.id] = { x: group.x, y: group.y, size: group.size };
        });

        const result = await sendData(`${API_BASE}/layout`, 'POST', layoutData);
        if (result) {
            // showMessageBox('Layout saved successfully!', 'success');
        }
    }

    async function initializeDashboard() {
        if (!dashboardContainer) return;
        const configData = await fetchData(`${API_BASE}/config`);
        if (configData) {
            currentNodes = configData.nodes || [];
            currentGroups = configData.groups || [];
            currentLayout = configData.layout || {};

            currentNodes.forEach(node => {
                const layout = currentLayout[node.id];
                if (layout) {
                    node.x = layout.x;
                    node.y = layout.y;
                    node.size = layout.size || 'medium';
                } else {
                    node.x = 0; node.y = 0;
                    node.size = node.size || 'medium';
                }
            });
            currentGroups.forEach(group => {
                const layout = currentLayout[group.id];
                if (layout) {
                    group.x = layout.x;
                    group.y = layout.y;
                    group.size = layout.size || 'medium';
                } else {
                    group.x = 0; group.y = 0;
                    group.size = group.size || 'medium';
                }
            });
            populateGroupDropdown();
            renderDashboard();
            startPolling();
        }
    }

    if (nodeForm) {
        nodeForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = nodeIdInput.value;
            const name = nodeNameInput.value;
            const type = nodeTypeSelect.value;
            const size = nodeSizeSelect.value;
            const node_ua_id = nodeUaIdInput.value;
            const groupId = nodeGroupSelect.value || null;

            const nodeData = { id, name, type, size, node_ua_id, groupId };

            const result = await sendData(`${API_BASE}/nodes`, 'POST', nodeData);
            if (result) {
                if (id) {
                    const index = currentNodes.findIndex(n => n.id === id);
                    if (index !== -1) {
                        currentNodes[index] = { ...currentNodes[index], ...result };
                    }
                    showMessageBox(`Node "${name}" updated successfully!`, 'success');
                } else {
                    currentNodes.push(result);
                    showMessageBox(`Node "${name}" added successfully!`, 'success');
                }
                renderDashboard();
                closeModal(nodeModal);
            }
        };
    }

    if (groupForm) {
        groupForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = groupIdInput.value;
            const title = groupTitleInput.value;
            const size = groupSizeSelect.value;

            const groupData = { id, title, size };

            const result = await sendData(`${API_BASE}/groups`, 'POST', groupData);
            if (result) {
                if (id) {
                    const index = currentGroups.findIndex(g => g.id === id);
                    if (index !== -1) {
                        currentGroups[index] = { ...currentGroups[index], ...result };
                    }
                    showMessageBox(`Group "${title}" updated successfully!`, 'success');
                } else {
                    currentGroups.push(result);
                    showMessageBox(`Group "${title}" added successfully!`, 'success');
                }
                populateGroupDropdown();
                renderDashboard();
                closeModal(groupModal);
            }
        };
    }

    function editNode(id) {
        const node = currentNodes.find(n => n.id === id);
        if (node && nodeModal) {
            nodeModalTitle.textContent = 'Edit Node';
            nodeIdInput.value = node.id;
            nodeNameInput.value = node.name;
            nodeTypeSelect.value = node.type;
            nodeSizeSelect.value = node.size || 'medium';
            nodeUaIdInput.value = node.node_ua_id;
            nodeGroupSelect.value = node.groupId || '';
            openModal(nodeModal);
            hideContextMenu();
        }
    }

    function editGroup(id) {
        const group = currentGroups.find(g => g.id === id);
        if (group && groupModal) {
            groupModalTitle.textContent = 'Edit Group';
            groupIdInput.value = group.id;
            groupTitleInput.value = group.title;
            groupSizeSelect.value = group.size || 'medium';
            openModal(groupModal);
            hideContextMenu();
        }
    }

    async function deleteNode(id) {
        const result = await sendData(`${API_BASE}/nodes/${id}`, 'DELETE');
        if (result) {
            currentNodes = currentNodes.filter(node => node.id !== id);
            showMessageBox('Node deleted successfully!', 'success');
            renderDashboard();
        }
        hideContextMenu();
    }

    async function deleteGroup(id) {
        const result = await sendData(`${API_BASE}/groups/${id}`, 'DELETE');
        if (result) {
            currentGroups = currentGroups.filter(group => group.id !== id);
            currentNodes.forEach(node => {
                if (node.groupId === id) {
                    node.groupId = null;
                }
            });
            showMessageBox('Group deleted successfully!', 'success');
            populateGroupDropdown();
            renderDashboard();
        }
        hideContextMenu();
    }

    let pollingIntervalId;
    async function startPolling() {
        if (!dashboardContainer) return;
        if (pollingIntervalId) clearInterval(pollingIntervalId);

        await readAllNodeValues();

        pollingIntervalId = setInterval(async () => {
            await readAllNodeValues();
        }, POLLING_INTERVAL);
    }

    async function readAllNodeValues() {
        for (const node of currentNodes) {
            try {
                const response = await fetch(`${API_BASE}/node_value/${node.node_ua_id}`);
                const data = await response.json();
                if (response.ok) {
                    node.value = data.value;
                    const valueDisplay = document.getElementById(`value-${node.id}`);
                    if (valueDisplay) {
                        valueDisplay.textContent = data.value;
                    }
                    if (node.type === 'switch') {
                        const checkbox = document.querySelector(`#node-${node.id} input[type="checkbox"]`);
                        if (checkbox) {
                            checkbox.checked = (data.value === 'True' || data.value === true);
                        }
                    } else {
                        const inputField = document.querySelector(`#node-${node.id} input[type="text"]`);
                        if (inputField) {
                            inputField.value = data.value;
                        }
                    }
                } else {
                    console.error(`Error reading node ${node.node_ua_id}: ${data.error}`);
                    const valueDisplay = document.getElementById(`value-${node.id}`);
                    if (valueDisplay) {
                        valueDisplay.textContent = 'Error';
                        valueDisplay.classList.add('text-red-500');
                    }
                }
            } catch (error) {
                console.error(`Network error reading node ${node.node_ua_id}:`, error);
                const valueDisplay = document.getElementById(`value-${node.id}`);
                if (valueDisplay) {
                    valueDisplay.textContent = 'Offline';
                    valueDisplay.classList.add('text-red-500');
                }
            }
        }
    }

    function saveSettings() {
        localStorage.setItem('opcuaClientSettings', JSON.stringify(currentSettings));
        showMessageBox('Settings saved!', 'success');
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem('opcuaClientSettings');
        if (savedSettings) {
            currentSettings = { ...defaultSettings, ...JSON.parse(savedSettings) };
        }
        applySettings();
    }

    function applySettings() {
        document.documentElement.style.setProperty('--font-size', `${currentSettings.fontSize}px`);
        if (fontSizeSlider) {
            fontSizeSlider.value = currentSettings.fontSize;
        }
        if (fontSizeValueSpan) {
            fontSizeValueSpan.textContent = `${currentSettings.fontSize}px`;
        }

        if (currentSettings.darkMode) {
            document.body.classList.add('dark-mode');
            if (darkModeToggle) {
                darkModeToggle.checked = true;
            }
        } else {
            document.body.classList.remove('dark-mode');
            if (darkModeToggle) {
                darkModeToggle.checked = false;
            }
        }

        document.documentElement.style.setProperty('--primary-color', currentSettings.primaryColor);
        document.documentElement.style.setProperty('--secondary-color', currentSettings.secondaryColor);
        document.documentElement.style.setProperty('--text-color', currentSettings.textColor);
        document.documentElement.style.setProperty('--bg-color', currentSettings.bgColor);
        document.documentElement.style.setProperty('--card-bg-color', currentSettings.cardBgColor);

        if (primaryColorPicker) primaryColorPicker.value = currentSettings.primaryColor;
        if (secondaryColorPicker) secondaryColorPicker.value = currentSettings.secondaryColor;
        if (textColorPicker) textColorPicker.value = currentSettings.textColor;
        if (bgColorPicker) bgColorPicker.value = currentSettings.bgColor;
        if (cardBgColorPicker) cardBgColorPicker.value = currentSettings.cardBgColor;
    }

    // Right-click context menu logic (Only if dashboardContainer exists)
    if (dashboardContainer) {
        dashboardContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            const targetCard = e.target.closest('.card');
            const targetGroup = e.target.closest('.group-section');

            if (targetCard) {
                activeElementId = targetCard.getAttribute('data-id');
                activeElementType = targetCard.getAttribute('data-type');
                if (contextMenu) {
                    contextMenu.style.display = 'block';
                    contextMenu.style.left = `${e.pageX}px`;
                    contextMenu.style.top = `${e.pageY}px`;
                }
            } else if (targetGroup) {
                activeElementId = targetGroup.getAttribute('data-id');
                activeElementType = targetGroup.getAttribute('data-type');
                if (contextMenu) {
                    contextMenu.style.display = 'block';
                    contextMenu.style.left = `${e.pageX}px`;
                    contextMenu.style.top = `${e.pageY}px`;
                }
            } else {
                hideContextMenu();
            }
        });
    }


    // Event Listeners for main buttons (Conditional attachment)
    if (addNodeBtn) {
        addNodeBtn.addEventListener('click', () => {
            nodeModalTitle.textContent = 'Add New Node';
            nodeForm.reset();
            nodeIdInput.value = '';
            nodeSizeSelect.value = 'medium';
            populateGroupDropdown();
            openModal(nodeModal);
        });
    }

    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', () => {
            groupModalTitle.textContent = 'Add New Group';
            groupForm.reset();
            groupIdInput.value = '';
            groupSizeSelect.value = 'medium';
            openModal(groupModal);
        });
    }

    if (saveLayoutBtn) {
        saveLayoutBtn.addEventListener('click', async () => {
            await saveLayout();
            showMessageBox('Layout saved successfully!', 'success');
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            openModal(settingsModal);
        });
    }

    // Settings controls event listeners (Conditional attachment)
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (e) => {
            currentSettings.fontSize = parseInt(e.target.value);
            applySettings();
            saveSettings();
        });
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', (e) => {
            currentSettings.darkMode = e.target.checked;
            applySettings();
            saveSettings();
        });
    }

    if (primaryColorPicker) primaryColorPicker.addEventListener('input', (e) => {
        currentSettings.primaryColor = e.target.value;
        applySettings();
        saveSettings();
    });
    if (secondaryColorPicker) secondaryColorPicker.addEventListener('input', (e) => {
        currentSettings.secondaryColor = e.target.value;
        applySettings();
        saveSettings();
    });
    if (textColorPicker) textColorPicker.addEventListener('input', (e) => {
        currentSettings.textColor = e.target.value;
        applySettings();
        saveSettings();
    });
    if (bgColorPicker) bgColorPicker.addEventListener('input', (e) => {
        currentSettings.bgColor = e.target.value;
        applySettings();
        saveSettings();
    });
    if (cardBgColorPicker) cardBgColorPicker.addEventListener('input', (e) => {
        currentSettings.cardBgColor = e.target.value;
        applySettings();
        saveSettings();
    });


    // Initial load of dashboard elements and settings
    loadSettings();
    if (dashboardContainer) { // Only initialize dashboard if on the dashboard page
        initializeDashboard();
    }
});
