// This file now contains ONLY common utility functions.
// All page-specific logic has been moved to configure.js, dashboard.js, historical.js, and scada.js.

/**
 * Displays a temporary message box at the bottom right of the screen.
 * @param {string} message - The message to display.
 * @param {'info' | 'success' | 'error'} type - The type of message (determines color).
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

/**
 * A helper function to send API requests and handle common error patterns.
 * @param {string} url - The API endpoint URL.
 * @param {string} method - The HTTP method (e.g., 'GET', 'POST', 'DELETE').
 * @param {object | null} data - The data to send in the request body (for POST/PUT).
 * @returns {Promise<object | null>} - A promise that resolves with the JSON response or null on error.
 */
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
