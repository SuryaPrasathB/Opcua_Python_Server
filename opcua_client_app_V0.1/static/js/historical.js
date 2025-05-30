// Global chart instance to manage updating/destroying existing charts
let historicalChart;

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


    // --- Logic specific to the Historical page ---
    // These elements are specific to historical.html, so they are guaranteed to exist when this script runs
    const historicalNodeSelect = document.getElementById('historicalNodeSelect');
    const loadHistoricalDataBtn = document.getElementById('loadHistoricalData');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const historicalChartCanvas = document.getElementById('historicalChart');


    /**
     * Populates the node dropdown on the historical data page.
     * Fetches nodes from /api/nodes and adds them to the select element.
     */
    async function populateHistoricalNodeDropdown() {
        historicalNodeSelect.innerHTML = '<option value="">Loading nodes...</option>'; // Set loading state

        try {
            const nodes = await sendApiRequest(`${API_BASE}/nodes`, 'GET');
            
            historicalNodeSelect.innerHTML = '<option value="">--Select a Node--</option>'; // Default empty option
            if (nodes && nodes.length > 0) {
                nodes.forEach(node => {
                    const option = document.createElement('option');
                    option.value = node.id; // Use internal node ID
                    option.textContent = node.name || node.node_ua_id; // Display name or UA ID
                    historicalNodeSelect.appendChild(option);
                });
            } else {
                historicalNodeSelect.innerHTML += '<option value="" disabled>No nodes configured.</option>';
            }
        } catch (error) {
            console.error('Error fetching nodes for historical dropdown:', error);
            historicalNodeSelect.innerHTML = '<option value="">Error loading nodes.</option>';
        }
    }

    /**
     * Loads historical data for the selected node and time range, then displays it on a Chart.js graph.
     */
    async function loadHistoricalChart() {
        const selectedNodeId = historicalNodeSelect.value;
        if (!selectedNodeId) {
            showMessageBox('Please select a node to view historical data.', 'info');
            return;
        }

        const startTime = startDateInput.value; // YYYY-MM-DD format
        const endTime = endDateInput.value;   // YYYY-MM-DD format

        try {
            let url = `${API_BASE}/historical_data?node_id=${selectedNodeId}`;
            if (startTime) url += `&start_time=${startTime}T00:00:00`; // Append time for ISO format
            if (endTime) url += `&end_time=${endTime}T23:59:59`;     // Append time for ISO format

            const data = await sendApiRequest(url, 'GET');

            if (!data || data.length === 0) {
                showMessageBox('No historical data available for the selected node and time range. Try a different range or ensure subscriptions are active.', 'info');
                // Clear existing chart if no data
                if (historicalChart) {
                    historicalChart.destroy();
                    historicalChart = null;
                }
                return;
            }

            // Prepare data for Chart.js
            const labels = data.map(item => new Date(item.timestamp).toLocaleString());
            const values = data.map(item => {
                const numVal = parseFloat(item.value);
                return isNaN(numVal) ? null : numVal;
            });

            const ctx = historicalChartCanvas.getContext('2d');

            // Destroy existing chart instance before creating a new one
            if (historicalChart) {
                historicalChart.destroy();
            }

            historicalChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `Value of ${data[0].node_name || data[0].node_ua_id}`,
                        data: values,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.1,
                        fill: false,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Time'
                            },
                            grid: {
                                display: false
                            }
                        },
                        y: {
                            beginAtZero: false,
                            title: {
                                display: true,
                                text: 'Value'
                            },
                            grid: {
                                color: 'rgba(200, 200, 200, 0.2)'
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                title: function(context) {
                                    return `Time: ${context[0].label}`;
                                },
                                label: function(context) {
                                    return `Value: ${context.parsed.y}`;
                                }
                            }
                        },
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error loading historical chart:', error);
            showMessageBox('An error occurred while loading the chart. Check console for details.', 'error');
        }
    }

    // --- Initialize Historical page ---
    populateHistoricalNodeDropdown(); // Populate dropdown when page loads

    if (loadHistoricalDataBtn) {
        loadHistoricalDataBtn.addEventListener('click', loadHistoricalChart);
    }

    // Set default date range for convenience (last 24 hours)
    const now = new Date();
    if (endDateInput) {
        endDateInput.value = now.toISOString().split('T')[0];
    }
    if (startDateInput) {
        const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        startDateInput.value = twentyFourHoursAgo.toISOString().split('T')[0];
    }
});
