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
                    this.toggleFullscreen();
                }
                break;
                
            case 'Escape':
                if (this.isFullscreen) {
                    this.exitFullscreen();
                }
                break;
                
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
                if (event.ctrlKey || event.metaKey) {
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
                utilization: Math.round((gridState.occupiedSlots / gridState.maxSlots) * 100)
            },
            ui: {
                fullscreen: this.isFullscreen,
                autoRefresh: this.autoRefreshCheckbox.checked
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