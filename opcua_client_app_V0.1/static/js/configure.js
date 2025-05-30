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

    // --- Configure Page Logic ---
    const opcUaEndpointInput = document.getElementById('opcUaEndpoint');
    const saveEndpointBtn = document.getElementById('saveEndpointBtn');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const connectionStatusDiv = document.getElementById('connectionStatus');

    if (saveEndpointBtn) {
        saveEndpointBtn.addEventListener('click', async () => {
            const endpointUrl = opcUaEndpointInput.value;
            if (!endpointUrl) {
                showMessageBox('Please enter an OPC UA endpoint URL.', 'info');
                return;
            }
            const result = await sendApiRequest(`${API_BASE}/opcua_endpoint`, 'POST', { url: endpointUrl });
            if (result) {
                showMessageBox(result.message, 'success');
            }
        });
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            const endpointUrl = opcUaEndpointInput.value;
            if (!endpointUrl) {
                showMessageBox('Please enter an OPC UA endpoint URL to connect.', 'info');
                return;
            }
            connectionStatusDiv.classList.remove('hidden', 'bg-green-100', 'bg-red-100');
            connectionStatusDiv.classList.add('bg-gray-100', 'text-gray-800');
            connectionStatusDiv.textContent = 'Attempting to connect...';

            const result = await sendApiRequest(`${API_BASE}/opcua_connect`, 'POST', { url: endpointUrl });
            if (result) {
                if (result.message.includes("Successfully connected")) {
                    connectionStatusDiv.classList.remove('bg-gray-100', 'bg-red-100');
                    connectionStatusDiv.classList.add('bg-green-100', 'text-green-800');
                    connectionStatusDiv.textContent = 'Connection Successful!';
                    showMessageBox(result.message, 'success');
                } else {
                    connectionStatusDiv.classList.remove('bg-gray-100', 'bg-green-100');
                    connectionStatusDiv.classList.add('bg-red-100', 'text-red-800');
                    connectionStatusDiv.textContent = `Connection Failed: ${result.error || 'Unknown error'}`;
                    showMessageBox(result.error || 'Connection failed.', 'error');
                }
            } else {
                connectionStatusDiv.classList.remove('bg-gray-100', 'bg-green-100');
                connectionStatusDiv.classList.add('bg-red-100', 'text-red-800');
                connectionStatusDiv.textContent = 'Connection Failed: Network error or server response issue.';
                showMessageBox('Connection failed due to network error.', 'error');
            }
        });
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', async () => {
            connectionStatusDiv.classList.remove('hidden', 'bg-green-100', 'bg-red-100');
            connectionStatusDiv.classList.add('bg-gray-100', 'text-gray-800');
            connectionStatusDiv.textContent = 'Attempting to disconnect...';

            const endpointUrl = opcUaEndpointInput.value;
            if (!endpointUrl) {
                showMessageBox('No OPC UA endpoint configured to disconnect from.', 'info');
                connectionStatusDiv.classList.remove('bg-gray-100');
                connectionStatusDiv.classList.add('bg-red-100');
                connectionStatusDiv.textContent = 'Disconnection Failed: No endpoint.';
                return;
            }

            const result = await sendApiRequest(`${API_BASE}/opcua_disconnect`, 'POST', { url: endpointUrl });
            if (result && result.message.includes("Disconnected")) {
                connectionStatusDiv.classList.remove('bg-gray-100', 'bg-red-100');
                connectionStatusDiv.classList.add('bg-green-100', 'text-green-800');
                connectionStatusDiv.textContent = 'Disconnected Successfully.';
                showMessageBox(result.message, 'success');
            } else {
                connectionStatusDiv.classList.remove('bg-gray-100', 'bg-green-100');
                connectionStatusDiv.classList.add('bg-red-100', 'text-red-800');
                connectionStatusDiv.textContent = `Disconnection Failed: ${result ? result.error : 'Unknown error'}`;
                showMessageBox(result ? result.error : 'Disconnection failed.', 'error');
            }
        });
    }
});
