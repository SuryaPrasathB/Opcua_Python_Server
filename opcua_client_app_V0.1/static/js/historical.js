document.addEventListener('DOMContentLoaded', async () => {
    const nodeSelect = document.getElementById('nodeSelect');
    const timeRangeSelect = document.getElementById('timeRange');
    const customRangeInputs = document.getElementById('customRangeInputs');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const fetchHistoryBtn = document.getElementById('fetchHistoryBtn');
    const historicalChartCanvas = document.getElementById('historicalChart');
    const noDataMessage = document.getElementById('noDataMessage');

    let historicalChartInstance = null; // To hold the Chart.js instance
    const API_BASE = '/api';

    /**
     * Displays a temporary message box.
     * This function is duplicated from main.js and scada.js for self-containment.
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
     * Populates the node selection dropdown with configured nodes.
     */
    async function populateNodeSelect() {
        const config = await fetchData(`${API_BASE}/config`);
        if (config && config.nodes) {
            nodeSelect.innerHTML = '<option value="">-- Select a Node --</option>';
            config.nodes.forEach(node => {
                const option = document.createElement('option');
                option.value = node.id; // Use the internal UUID
                option.textContent = node.name;
                nodeSelect.appendChild(option);
            });
        } else {
            showMessageBox('Failed to load nodes for historical data.', 'error');
        }
    }

    /**
     * Toggles visibility of custom date inputs based on time range selection.
     */
    function toggleCustomRangeInputs() {
        if (timeRangeSelect.value === 'custom') {
            customRangeInputs.classList.remove('hidden');
        } else {
            customRangeInputs.classList.add('hidden');
        }
    }

    /**
     * Fetches and displays historical data.
     */
    async function fetchAndRenderHistory() {
        const selectedNodeId = nodeSelect.value;
        const selectedTimeRange = timeRangeSelect.value;

        if (!selectedNodeId) {
            showMessageBox('Please select a node.', 'info');
            return;
        }

        let startTime = null;
        let endTime = new Date(); // Default end time is now

        if (selectedTimeRange === 'custom') {
            if (!startDateInput.value || !endDateInput.value) {
                showMessageBox('Please enter both start and end dates for custom range.', 'info');
                return;
            }
            startTime = new Date(startDateInput.value);
            endTime = new Date(endDateInput.value);
            // Adjust end time to end of day for date-only input
            endTime.setHours(23, 59, 59, 999); 

            if (startTime >= endTime) {
                showMessageBox('Start date must be before end date.', 'error');
                return;
            }
        } else {
            switch (selectedTimeRange) {
                case 'last_hour':
                    startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
                    break;
                case 'last_6_hours':
                    startTime = new Date(endTime.getTime() - 6 * 60 * 60 * 1000);
                    break;
                case 'last_24_hours':
                    startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case 'last_7_days':
                    startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startTime = new Date(0); // Epoch start if no specific range
                    break;
            }
        }

        const params = new URLSearchParams({
            node_id: selectedNodeId,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString()
        });

        const historicalData = await fetchData(`${API_BASE}/historical_data?${params.toString()}`);

        if (historicalData && historicalData.length > 0) {
            noDataMessage.classList.add('hidden');
            historicalChartCanvas.style.display = 'block';
            renderChart(historicalData);
        } else {
            noDataMessage.classList.remove('hidden');
            historicalChartCanvas.style.display = 'none';
            if (historicalChartInstance) {
                historicalChartInstance.destroy(); // Destroy existing chart if no data
                historicalChartInstance = null;
            }
            showMessageBox('No historical data found for the selected node and time range.', 'info');
        }
    }

    /**
     * Renders the historical data using Chart.js.
     * @param {Array<Object>} data - Array of historical data entries.
     */
    function renderChart(data) {
        const labels = data.map(entry => {
            const date = new Date(entry.timestamp);
            // Format timestamp for display (e.g., "YYYY-MM-DD HH:MM:SS")
            return date.toLocaleString();
        });

        // Attempt to parse values as numbers; if not, fall back to null or 0
        const values = data.map(entry => {
            const val = parseFloat(entry.value);
            return isNaN(val) ? null : val; // Use null for non-numeric values
        });

        const ctx = historicalChartCanvas.getContext('2d');

        if (historicalChartInstance) {
            historicalChartInstance.destroy(); // Destroy existing chart before creating a new one
        }

        historicalChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Node Value',
                    data: values,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
                    backgroundColor: 'rgba(37, 99, 235, 0.2)', // primary-color with transparency
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
                    fill: true,
                    tension: 0.1 // Smooth curves
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allow canvas to resize freely
                scales: {
                    x: {
                        type: 'category', // Use 'category' for string labels
                        title: {
                            display: true,
                            text: 'Time',
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color')
                        },
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color')
                        },
                        grid: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--dot-color')
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Value',
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color')
                        },
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color')
                        },
                        grid: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--dot-color')
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color')
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(2); // Format numbers
                                } else {
                                    label += 'N/A'; // For non-numeric values
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // Event Listeners
    if (timeRangeSelect) {
        timeRangeSelect.addEventListener('change', toggleCustomRangeInputs);
    }
    if (fetchHistoryBtn) {
        fetchHistoryBtn.addEventListener('click', fetchAndRenderHistory);
    }

    // Initial setup
    populateNodeSelect();
    toggleCustomRangeInputs(); // Set initial visibility of custom range inputs
    noDataMessage.classList.remove('hidden'); // Show no data message initially
    historicalChartCanvas.style.display = 'none'; // Hide canvas initially
});
