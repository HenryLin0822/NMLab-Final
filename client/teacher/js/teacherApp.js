/*
// Main Teacher Application
class TeacherApp {
    constructor() {
        this.refreshBtn = document.getElementById('refreshBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.autoRefreshCheckbox = document.getElementById('autoRefresh');
        this.activityLog = document.getElementById('activityLog');
        
        this.isFullscreen = false;
        this.autoRefreshInterval = null;
        this.maxActivityItems = 50;
        this.isDetailViewActive = false;
        
        this.initialize();
    }
    
    initialize() {
        // Check browser support
        const support = Utils.checkBrowserSupport();
        if (!support.webSocket) {
            Utils.showNotification('Your browser does not support WebSocket connections', 'error');
            return;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Connect to WebSocket
        window.teacherWebSocket.connect();
        
        // Start grid connection monitoring
        window.studentGrid.startConnectionMonitoring();
        
        // Setup auto refresh if enabled
        this.updateAutoRefresh();
        
        // Setup detail view activity tracking
        this.setupDetailViewActivityTracking();
        
        // Initialize activity log
        this.addActivity('Teacher dashboard initialized', 'info');
        
        Utils.log('Teacher app initialized');
    }
    
    setupEventListeners() {
        // Control buttons
        this.refreshBtn.addEventListener('click', () => this.refreshStudentData());
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.clearAllBtn.addEventListener('click', () => this.clearAllStreams());
        
        // Auto refresh toggle
        this.autoRefreshCheckbox.addEventListener('change', () => this.updateAutoRefresh());
        
        // Listen for activity updates
        document.addEventListener('activityUpdate', (event) => {
            this.addActivity(event.detail.message, event.detail.type);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });
        
        // Fullscreen change events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());
        
        // Page visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.autoRefreshCheckbox.checked) {
                this.refreshStudentData();
            }
        });
        
        // Before page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    setupDetailViewActivityTracking() {
        // Listen for detail view events
        document.addEventListener('studentDetailViewShown', (event) => {
            const studentName = event.detail.studentName;
            this.addActivity(`Viewing ${studentName} in detail`, 'detail-view');
        });
        
        document.addEventListener('studentDetailViewHidden', (event) => {
            this.addActivity('Returned to grid view', 'detail-view');
        });
    }
    
    refreshStudentData() {
        Utils.log('Refreshing student data...');
        
        // Dispatch refresh event
        const event = new CustomEvent('refreshStudentGrid');
        document.dispatchEvent(event);
        
        // Show brief notification
        Utils.showNotification('Refreshing student data...', 'info', 1500);
        
        this.addActivity('Student data refreshed', 'info');
    }
    
    toggleFullscreen() {
        if (!this.isFullscreen) {
            this.enterFullscreen();
        } else {
            this.exitFullscreen();
        }
    }
    
    enterFullscreen() {
        const gridContainer = document.querySelector('.students-grid-container');
        
        if (gridContainer.requestFullscreen) {
            gridContainer.requestFullscreen();
        } else if (gridContainer.webkitRequestFullscreen) {
            gridContainer.webkitRequestFullscreen();
        } else if (gridContainer.mozRequestFullScreen) {
            gridContainer.mozRequestFullScreen();
        } else if (gridContainer.msRequestFullscreen) {
            gridContainer.msRequestFullscreen();
        }
        
        // Add fullscreen class
        document.body.classList.add('fullscreen-mode');
        this.fullscreenBtn.textContent = 'Exit Fullscreen';
        this.isFullscreen = true;
        
        Utils.log('Entered fullscreen mode');
        this.addActivity('Entered fullscreen mode', 'info');
    }
    
    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        // Remove fullscreen class
        document.body.classList.remove('fullscreen-mode');
        this.fullscreenBtn.textContent = 'Fullscreen';
        this.isFullscreen = false;
        
        Utils.log('Exited fullscreen mode');
        this.addActivity('Exited fullscreen mode', 'info');
    }
    
    handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
        
        if (!isFullscreen && this.isFullscreen) {
            // Exited fullscreen via ESC key
            this.isFullscreen = false;
            document.body.classList.remove('fullscreen-mode');
            this.fullscreenBtn.textContent = 'Fullscreen';
        }
    }
    
    clearAllStreams() {
        if (confirm('Are you sure you want to clear all student streams? This will reset the grid.')) {
            window.studentGrid.clearAllSlots();
            this.addActivity('All student streams cleared', 'alert');
            Utils.showNotification('All streams cleared', 'warning');
            Utils.log('All student streams cleared');
        }
    }
    
    updateAutoRefresh() {
        if (this.autoRefreshCheckbox.checked) {
            // Start auto refresh every 30 seconds
            this.autoRefreshInterval = setInterval(() => {
                if (!document.hidden) {
                    this.refreshStudentData();
                }
            }, 30000);
            
            Utils.log('Auto refresh enabled (30s interval)');
        } else {
            // Stop auto refresh
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
            }
            
            Utils.log('Auto refresh disabled');
        }
    }
    
    handleKeyboardShortcuts(event) {
        // Only handle shortcuts when not in input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
            return;
        }
        
        // Check if detail view is active
        this.isDetailViewActive = window.studentGrid.currentDetailStudent !== null;
        
        switch (event.key) {
            case 'r':
            case 'R':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.refreshStudentData();
                }
                break;
                
            case 'f':
            case 'F':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    // Toggle fullscreen for detail view or main view
                    if (this.isDetailViewActive) {
                        window.studentGrid.toggleDetailFullscreen();
                    } else {
                        this.toggleFullscreen();
                    }
                }
                break;
                
            case 'Escape':
                if (this.isDetailViewActive) {
                    // Close detail view
                    window.studentGrid.hideDetailView();
                } else if (this.isFullscreen) {
                    this.exitFullscreen();
                }
                break;
                
            case 'b':
            case 'B':
                // Back from detail view
                if (this.isDetailViewActive) {
                    event.preventDefault();
                    window.studentGrid.hideDetailView();
                }
                break;
                
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
                if ((event.ctrlKey || event.metaKey) && !this.isDetailViewActive) {
                    event.preventDefault();
                    this.switchGridLayout(event.key);
                }
                break;
        }
    }
    
    switchGridLayout(key) {
        const layouts = {
            '1': '2x2',
            '2': '2x3',
            '3': '2x4',
            '4': '2x5',
            '5': '3x4'
        };
        
        const layout = layouts[key];
        if (layout) {
            document.getElementById('gridSize').value = layout;
            window.studentGrid.changeGridSize(layout);
            this.addActivity(`Grid layout changed to ${layout}`, 'info');
        }
    }
    
    addActivity(message, type = '') {
        const timestamp = Utils.formatTime(new Date());
        const activityItem = document.createElement('div');
        activityItem.className = `activity-item ${type}`;
        
        activityItem.innerHTML = `
            <div class="timestamp">${timestamp}</div>
            <div>${message}</div>
        `;
        
        // Add to top of activity log
        this.activityLog.insertBefore(activityItem, this.activityLog.firstChild);
        
        // Limit number of activity items
        while (this.activityLog.children.length > this.maxActivityItems) {
            this.activityLog.removeChild(this.activityLog.lastChild);
        }
        
        // Scroll to top if not manually scrolled
        if (this.activityLog.scrollTop < 50) {
            this.activityLog.scrollTop = 0;
        }
    }
    
    getDashboardStats() {
        const connectionState = window.teacherWebSocket.getConnectionState();
        const gridState = window.studentGrid.getGridState();
        
        return {
            server: {
                connected: connectionState.isConnected,
                reconnectAttempts: connectionState.reconnectAttempts
            },
            students: {
                total: connectionState.studentCount,
                active: gridState.occupiedSlots,
                maxSlots: gridState.maxSlots
            },
            grid: {
                size: gridState.currentGridSize,
                utilization: Math.round((gridState.occupiedSlots / gridState.maxSlots) * 100),
                detailViewActive: gridState.detailViewActive,
                currentDetailStudent: gridState.currentDetailStudent
            },
            ui: {
                fullscreen: this.isFullscreen,
                autoRefresh: this.autoRefreshCheckbox.checked,
                detailView: this.isDetailViewActive
            },
            gaze: {
                enabled: gridState.gazeTrackingEnabled,
                alerts: gridState.gazeAlerts
            }
        };
    }
    
    exportActivityLog() {
        const activities = Array.from(this.activityLog.children).map(item => {
            const timestamp = item.querySelector('.timestamp').textContent;
            const message = item.children[1].textContent;
            const type = item.className.replace('activity-item ', '');
            return { timestamp, message, type };
        });
        
        const exportData = {
            exported: new Date().toISOString(),
            activities: activities,
            stats: this.getDashboardStats()
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], 
                            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `exam-monitoring-log-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addActivity('Activity log exported', 'info');
    }
    
    cleanup() {
        Utils.log('Cleaning up teacher app...');
        
        // Stop auto refresh
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        
        // Exit fullscreen
        if (this.isFullscreen) {
            this.exitFullscreen();
        }
        
        // Disconnect WebSocket
        window.teacherWebSocket.disconnect();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.teacherApp = new TeacherApp();
    Utils.log('Teacher app loaded and initialized');
});
*/

// Main Teacher Application with Gaze Tracking and AI Detection
class TeacherApp {
    constructor() {
        this.refreshBtn = document.getElementById('refreshBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.autoRefreshCheckbox = document.getElementById('autoRefresh');
        this.activityLog = document.getElementById('activityLog');
        
        this.isFullscreen = false;
        this.autoRefreshInterval = null;
        this.maxActivityItems = 50;
        this.isDetailViewActive = false;
        
        // NEW: AI detection control elements
        this.aiDetectionToggle = null; // Will be created dynamically
        this.aiDetectionEnabled = true; // Default enabled
        
        this.initialize();
    }
    
    initialize() {
        // Check browser support
        const support = Utils.checkBrowserSupport();
        if (!support.webSocket) {
            Utils.showNotification('Your browser does not support WebSocket connections', 'error');
            return;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Connect to WebSocket
        window.teacherWebSocket.connect();
        
        // Start grid connection monitoring
        window.studentGrid.startConnectionMonitoring();
        
        // Setup auto refresh if enabled
        this.updateAutoRefresh();
        
        // Setup detail view activity tracking
        this.setupDetailViewActivityTracking();
        
        // Create AI detection controls
        this.createAIDetectionControls();
        
        // Initialize activity log
        this.addActivity('Teacher dashboard initialized', 'info');
        
        Utils.log('Teacher app initialized');
    }
    
    setupEventListeners() {
        // Control buttons
        this.refreshBtn.addEventListener('click', () => this.refreshStudentData());
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.clearAllBtn.addEventListener('click', () => this.clearAllStreams());
        
        // Auto refresh toggle
        this.autoRefreshCheckbox.addEventListener('change', () => this.updateAutoRefresh());
        
        // Listen for activity updates
        document.addEventListener('activityUpdate', (event) => {
            this.addActivity(event.detail.message, event.detail.type);
        });
        
        // NEW: Listen for AI detection service status
        document.addEventListener('aiDetectionStatus', (event) => {
            this.handleAIDetectionStatus(event.detail);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });
        
        // Fullscreen change events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());
        
        // Page visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.autoRefreshCheckbox.checked) {
                this.refreshStudentData();
            }
        });
        
        // Before page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    setupDetailViewActivityTracking() {
        // Listen for detail view events
        document.addEventListener('studentDetailViewShown', (event) => {
            const studentName = event.detail.studentName;
            this.addActivity(`Viewing ${studentName} in detail`, 'detail-view');
        });
        
        document.addEventListener('studentDetailViewHidden', (event) => {
            this.addActivity('Returned to grid view', 'detail-view');
        });
    }
    
    // NEW: Create AI detection control elements
    createAIDetectionControls() {
        // Find controls container or create one
        /*
        let controlsContainer = document.querySelector('.ai-detection-controls');
        if (!controlsContainer) {
            controlsContainer = document.createElement('div');
            controlsContainer.className = 'ai-detection-controls';
            
            // Add to controls panel
            const controlsPanel = document.querySelector('.controls-panel');
            if (controlsPanel) {
                const controlGroup = document.createElement('div');
                controlGroup.className = 'control-group';
                
                const label = document.createElement('label');
                label.textContent = 'AI Detection:';
                
                this.aiDetectionToggle = document.createElement('button');
                this.aiDetectionToggle.id = 'aiDetectionToggle';
                this.aiDetectionToggle.className = 'btn btn-secondary ai-detection-btn';
                this.aiDetectionToggle.innerHTML = '🤖 AI Detection: ON';
                this.aiDetectionToggle.addEventListener('click', () => this.toggleAIDetection());
                
                controlGroup.appendChild(label);
                controlGroup.appendChild(this.aiDetectionToggle);
                controlsContainer.appendChild(controlGroup);
                
                controlsPanel.appendChild(controlsContainer);
            }
        }
        
        // Create AI detection stats display
        this.createAIDetectionStats();
        */
    }
    
    // NEW: Create AI detection statistics display
    createAIDetectionStats() {
        /*
        const activityPanel = document.querySelector('.activity-panel');
        if (!activityPanel) return;
        
        // Create AI stats section
        const aiStatsSection = document.createElement('div');
        aiStatsSection.className = 'ai-stats-section';
        aiStatsSection.innerHTML = `
            <h4>AI Detection Status</h4>
            <div id="aiStatsContent" class="ai-stats-content">
                <div class="stat-row">
                    <span class="stat-label">Real Persons:</span>
                    <span id="aiRealCount" class="stat-value">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">AI Generated:</span>
                    <span id="aiFakeCount" class="stat-value danger">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">No Face:</span>
                    <span id="aiNoFaceCount" class="stat-value warning">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Errors:</span>
                    <span id="aiErrorCount" class="stat-value">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Active Alerts:</span>
                    <span id="aiActiveAlerts" class="stat-value danger">0</span>
                </div>
            </div>
        `;
        
        // Insert before activity log
        activityPanel.insertBefore(aiStatsSection, activityPanel.querySelector('#activityLog'));
        
        // Start updating AI stats
        this.startAIStatsUpdates();
        */
        return;
    }
    
    // NEW: Handle AI detection status changes
    handleAIDetectionStatus(status) {
        
        this.aiDetectionEnabled = status.enabled;
        /*
        if (this.aiDetectionToggle) {
            this.aiDetectionToggle.innerHTML = `🤖 AI Detection: ${status.enabled ? 'ON' : 'OFF'}`;
            this.aiDetectionToggle.classList.toggle('btn-danger', !status.enabled);
            this.aiDetectionToggle.classList.toggle('btn-secondary', status.enabled);
        }
        */
        
        // Update stats visibility
        const aiStatsSection = document.querySelector('.ai-stats-section');
        if (aiStatsSection) {
            aiStatsSection.style.display = status.enabled ? 'block' : 'none';
        }
        
        this.addActivity(`AI detection ${status.enabled ? 'enabled' : 'disabled'}`, 'info');

    }
    
    // NEW: Toggle AI detection (if manual control is implemented)
    toggleAIDetection() {
        // This would require server-side implementation to actually toggle the service
        // For now, just show that it would toggle
        /*
        const newState = !this.aiDetectionEnabled;
        
        Utils.showNotification(
            `AI detection ${newState ? 'enabled' : 'disabled'}`, 
            newState ? 'success' : 'warning'
        );
        
        this.addActivity(`AI detection toggled ${newState ? 'on' : 'off'}`, 'info');
        */
        return;
    }
    
    // NEW: Start AI detection statistics updates
    startAIStatsUpdates() {
        // Update AI stats every 5 seconds
        setInterval(() => {
            this.updateAIDetectionStats();
        }, 5000);
        
        // Initial update
        this.updateAIDetectionStats();
    }
    
    // NEW: Update AI detection statistics display
    updateAIDetectionStats() {
        if (!this.aiDetectionEnabled) return;
        
        const stats = window.studentGrid.getAIDetectionStatistics();
        
        // Update stat elements
        const realCount = document.getElementById('aiRealCount');
        const fakeCount = document.getElementById('aiFakeCount');
        const noFaceCount = document.getElementById('aiNoFaceCount');
        const errorCount = document.getElementById('aiErrorCount');
        const activeAlerts = document.getElementById('aiActiveAlerts');
        
        if (realCount) realCount.textContent = stats.aiDetections.real;
        if (fakeCount) fakeCount.textContent = stats.aiDetections.fake;
        if (noFaceCount) noFaceCount.textContent = stats.aiDetections.no_face;
        if (errorCount) errorCount.textContent = stats.aiDetections.error;
        if (activeAlerts) activeAlerts.textContent = stats.activeAlerts;
        
        // Update styling based on values
        if (fakeCount) {
            fakeCount.className = `stat-value ${stats.aiDetections.fake > 0 ? 'danger' : ''}`;
        }
        if (activeAlerts) {
            activeAlerts.className = `stat-value ${stats.activeAlerts > 0 ? 'danger' : ''}`;
        }
    }
    
    refreshStudentData() {
        Utils.log('Refreshing student data...');
        
        // Dispatch refresh event
        const event = new CustomEvent('refreshStudentGrid');
        document.dispatchEvent(event);
        
        // Show brief notification
        Utils.showNotification('Refreshing student data...', 'info', 1500);
        
        this.addActivity('Student data refreshed', 'info');
    }
    
    toggleFullscreen() {
        if (!this.isFullscreen) {
            this.enterFullscreen();
        } else {
            this.exitFullscreen();
        }
    }
    
    enterFullscreen() {
        const gridContainer = document.querySelector('.students-grid-container');
        
        if (gridContainer.requestFullscreen) {
            gridContainer.requestFullscreen();
        } else if (gridContainer.webkitRequestFullscreen) {
            gridContainer.webkitRequestFullscreen();
        } else if (gridContainer.mozRequestFullScreen) {
            gridContainer.mozRequestFullScreen();
        } else if (gridContainer.msRequestFullscreen) {
            gridContainer.msRequestFullscreen();
        }
        
        // Add fullscreen class
        document.body.classList.add('fullscreen-mode');
        this.fullscreenBtn.textContent = 'Exit Fullscreen';
        this.isFullscreen = true;
        
        Utils.log('Entered fullscreen mode');
        this.addActivity('Entered fullscreen mode', 'info');
    }
    
    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        // Remove fullscreen class
        document.body.classList.remove('fullscreen-mode');
        this.fullscreenBtn.textContent = 'Fullscreen';
        this.isFullscreen = false;
        
        Utils.log('Exited fullscreen mode');
        this.addActivity('Exited fullscreen mode', 'info');
    }
    
    handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
        
        if (!isFullscreen && this.isFullscreen) {
            // Exited fullscreen via ESC key
            this.isFullscreen = false;
            document.body.classList.remove('fullscreen-mode');
            this.fullscreenBtn.textContent = 'Fullscreen';
        }
    }
    
    clearAllStreams() {
        if (confirm('Are you sure you want to clear all student streams? This will reset the grid.')) {
            window.studentGrid.clearAllSlots();
            this.addActivity('All student streams cleared', 'alert');
            Utils.showNotification('All streams cleared', 'warning');
            Utils.log('All student streams cleared');
        }
    }
    
    updateAutoRefresh() {
        if (this.autoRefreshCheckbox.checked) {
            // Start auto refresh every 30 seconds
            this.autoRefreshInterval = setInterval(() => {
                if (!document.hidden) {
                    this.refreshStudentData();
                }
            }, 30000);
            
            Utils.log('Auto refresh enabled (30s interval)');
        } else {
            // Stop auto refresh
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
            }
            
            Utils.log('Auto refresh disabled');
        }
    }
    
    handleKeyboardShortcuts(event) {
        // Only handle shortcuts when not in input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
            return;
        }
        
        // Check if detail view is active
        this.isDetailViewActive = window.studentGrid.currentDetailStudent !== null;
        
        switch (event.key) {
            case 'r':
            case 'R':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.refreshStudentData();
                }
                break;
                
            case 'f':
            case 'F':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    // Toggle fullscreen for detail view or main view
                    if (this.isDetailViewActive) {
                        window.studentGrid.toggleDetailFullscreen();
                    } else {
                        this.toggleFullscreen();
                    }
                }
                break;
                
            case 'Escape':
                if (this.isDetailViewActive) {
                    // Close detail view
                    window.studentGrid.hideDetailView();
                } else if (this.isFullscreen) {
                    this.exitFullscreen();
                }
                break;
                
            case 'b':
            case 'B':
                // Back from detail view
                if (this.isDetailViewActive) {
                    event.preventDefault();
                    window.studentGrid.hideDetailView();
                }
                break;
                
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
                if ((event.ctrlKey || event.metaKey) && !this.isDetailViewActive) {
                    event.preventDefault();
                    this.switchGridLayout(event.key);
                }
                break;
                
            // NEW: AI detection shortcut
            case 'a':
            case 'A':
                if ((event.ctrlKey || event.metaKey) && !this.isDetailViewActive) {
                    event.preventDefault();
                    this.toggleAIDetection();
                }
                break;
        }
    }
    
    switchGridLayout(key) {
        const layouts = {
            '1': '2x2',
            '2': '2x3',
            '3': '2x4',
            '4': '2x5',
            '5': '3x4'
        };
        
        const layout = layouts[key];
        if (layout) {
            document.getElementById('gridSize').value = layout;
            window.studentGrid.changeGridSize(layout);
            this.addActivity(`Grid layout changed to ${layout}`, 'info');
        }
    }
    
    addActivity(message, type = '') {
        const timestamp = Utils.formatTime(new Date());
        const activityItem = document.createElement('div');
        activityItem.className = `activity-item ${type}`;
        
        activityItem.innerHTML = `
            <div class="timestamp">${timestamp}</div>
            <div>${message}</div>
        `;
        
        // Add to top of activity log
        this.activityLog.insertBefore(activityItem, this.activityLog.firstChild);
        
        // Limit number of activity items
        while (this.activityLog.children.length > this.maxActivityItems) {
            this.activityLog.removeChild(this.activityLog.lastChild);
        }
        
        // Scroll to top if not manually scrolled
        if (this.activityLog.scrollTop < 50) {
            this.activityLog.scrollTop = 0;
        }
    }
    
    getDashboardStats() {
        const connectionState = window.teacherWebSocket.getConnectionState();
        const gridState = window.studentGrid.getGridState();
        const gazeStats = window.studentGrid.getGazeStatistics();
        const aiStats = window.studentGrid.getAIDetectionStatistics(); // NEW
        
        return {
            server: {
                connected: connectionState.isConnected,
                reconnectAttempts: connectionState.reconnectAttempts
            },
            students: {
                total: connectionState.studentCount,
                active: gridState.occupiedSlots,
                maxSlots: gridState.maxSlots
            },
            grid: {
                size: gridState.currentGridSize,
                utilization: Math.round((gridState.occupiedSlots / gridState.maxSlots) * 100),
                detailViewActive: gridState.detailViewActive,
                currentDetailStudent: gridState.currentDetailStudent
            },
            ui: {
                fullscreen: this.isFullscreen,
                autoRefresh: this.autoRefreshCheckbox.checked,
                detailView: this.isDetailViewActive
            },
            gaze: {
                enabled: gridState.gazeTrackingEnabled,
                alerts: gridState.gazeAlerts,
                stats: gazeStats
            },
            // NEW: AI detection statistics
            aiDetection: {
                enabled: gridState.aiDetectionEnabled,
                alerts: gridState.aiDetectionAlerts,
                stats: aiStats
            }
        };
    }
    
    // NEW: Export comprehensive activity log with AI detection data
    exportActivityLog() {
        const activities = Array.from(this.activityLog.children).map(item => {
            const timestamp = item.querySelector('.timestamp').textContent;
            const message = item.children[1].textContent;
            const type = item.className.replace('activity-item ', '');
            return { timestamp, message, type };
        });
        
        const exportData = {
            exported: new Date().toISOString(),
            activities: activities,
            stats: this.getDashboardStats(),
            // NEW: Include AI detection summary
            aiDetectionSummary: {
                enabled: this.aiDetectionEnabled,
                totalAnalyses: window.studentGrid.getAIDetectionStatistics().studentsWithAIData,
                alerts: Array.from(window.studentGrid.aiDetectionAlerts.values())
            }
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], 
                            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `exam-monitoring-log-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addActivity('Activity log exported with AI detection data', 'info');
    }
    
    // NEW: Generate AI detection report
    generateAIDetectionReport() {
        const aiStats = window.studentGrid.getAIDetectionStatistics();
        const gridState = window.studentGrid.getGridState();
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalStudents: aiStats.totalStudents,
                studentsAnalyzed: aiStats.studentsWithAIData,
                analysisRate: Math.round((aiStats.studentsWithAIData / aiStats.totalStudents) * 100),
                averageConfidence: Math.round(aiStats.averageConfidence * 100)
            },
            detections: aiStats.aiDetections,
            alerts: {
                active: aiStats.activeAlerts,
                details: Array.from(window.studentGrid.aiDetectionAlerts.values())
            },
            studentDetails: gridState.students.filter(s => s.aiDetection).map(student => ({
                name: student.name,
                slot: student.slotNumber,
                detection: student.aiDetection,
                confidence: Math.round((student.aiConfidence || 0) * 100)
            }))
        };
        
        const blob = new Blob([JSON.stringify(report, null, 2)], 
                            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-detection-report-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addActivity('AI detection report generated', 'info');
        Utils.showNotification('AI detection report downloaded', 'success');
    }
    
    cleanup() {
        Utils.log('Cleaning up teacher app...');
        
        // Stop auto refresh
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        
        // Exit fullscreen
        if (this.isFullscreen) {
            this.exitFullscreen();
        }
        
        // Disconnect WebSocket
        window.teacherWebSocket.disconnect();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.teacherApp = new TeacherApp();
    Utils.log('Teacher app loaded and initialized');
});