// GTD Task Manager - Main Application Logic

class GTDTaskManager {
    constructor() {
        this.tasks = [];
        this.currentEditingTask = null;
        this.draggedTask = null;
        this.filterDrawerExpanded = false;
        this.taskFormExpanded = false; // Track expanded form state
        this.useFirebase = false; // Will be enabled when Firebase is ready
        
        this.init();
    }

    init() {
        this.loadTasksFromStorage();
        this.setupEventListeners();
        this.setupServiceWorker();
        
        // Process any missed recurring tasks
        this.processOverdueRecurringTasks();
        
        this.renderTasks();
        this.updateStatistics();
        
        // Initialize rich text editors
        this.initializeRichTextEditors();
        
        // Initialize filter drawer as collapsed
        const filterDrawer = document.getElementById('filterDrawer');
        filterDrawer.classList.add('collapsed');
        
        // Check for Firebase availability
        this.checkFirebaseReady();
    }

    checkFirebaseReady() {
        if (window.firebaseManager && window.firebaseManager.user) {
            this.useFirebase = true;
            console.log('Firebase integration enabled');
        } else {
            // Check again after a short delay
            setTimeout(() => this.checkFirebaseReady(), 1000);
        }
    }

    initializeRichTextEditors() {
        // Initialize rich text editor for new task notes
        this.newTaskNotesEditor = new RichTextEditor('newTaskNotesEditor', {
            placeholder: 'Add detailed notes with rich formatting...',
            minHeight: '100px',
            maxHeight: '200px'
        });

        // Initialize rich text editor for edit task notes
        this.editTaskNotesEditor = new RichTextEditor('editTaskNotesEditor', {
            placeholder: 'Add detailed notes with rich formatting...',
            minHeight: '120px',
            maxHeight: '250px'
        });
    }

    // Make links in task notes clickable
    makeLinksClickable(container) {
        const links = container.querySelectorAll('a');
        links.forEach(link => {
            // Ensure link has href attribute
            if (!link.href) {
                const href = link.getAttribute('href') || link.textContent;
                if (href) {
                    // Add protocol if missing
                    if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:')) {
                        link.href = 'https://' + href;
                    } else {
                        link.href = href;
                    }
                }
            }
            
            // Set link properties
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            
            // Add click handler
            link.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent task selection
                // Link will open naturally due to href and target attributes
            });
            
            // Add hover effect
            link.addEventListener('mouseenter', () => {
                link.style.textDecoration = 'none';
            });
            
            link.addEventListener('mouseleave', () => {
                link.style.textDecoration = 'underline';
            });
        });
    }

    // Toggle subtasks visibility
    // Simple toggle method
    simpleToggleSubtasks(taskId) {
        console.log('Toggle called for task:', taskId);
        const container = document.querySelector(`[data-parent-task-id="${taskId}"]`);
        console.log('Found container:', container);
        
        if (container) {
            // Check if it's currently hidden
            const isHidden = container.style.display === 'none';
            console.log('Currently hidden:', isHidden);
            console.log('Current display value:', container.style.display);
            
            if (isHidden) {
                // Show it
                container.style.display = '';
                console.log('Showing container');
            } else {
                // Hide it
                container.style.display = 'none';
                console.log('Hiding container');
            }
            
            console.log('New display value:', container.style.display);
        } else {
            console.log('Container not found!');
        }
    }
    
    // Utility Functions
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    formatDateTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString();
    }

    getPriorityIcon(priority) {
        const icons = {
            urgent: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🔵'
        };
        return icons[priority] || '🔵';
    }

    // Task Management
    addTask(text, priority = 'medium', dueDate = null, notes = '', tags = [], progress = 0, repeatType = 'none', repeatUntil = null) {
        if (!text.trim()) return;

        const task = {
            id: this.generateId(),
            text: text.trim(),
            completed: false,
            priority: priority,
            dueDate: dueDate,
            createdAt: new Date().toISOString(),
            notes: notes.trim(),
            tags: tags.filter(tag => tag.trim()),
            progress: progress,
            archived: false,
            subtasks: [],
            repeatType: repeatType,
            repeatUntil: repeatUntil
        };

        this.tasks.unshift(task);
        this.saveTasksToStorage();
        
        // Also save to Firebase if available
        if (this.useFirebase && window.firebaseManager) {
            window.firebaseManager.saveTask(task);
        }
        
        this.renderTasks();
        this.updateStatistics();
        
        // Clear input fields
        this.clearTaskForm();
    }

    clearTaskForm() {
        document.getElementById('newTaskInput').value = '';
        document.getElementById('taskDueDate').value = '';
        document.getElementById('newTaskTags').value = '';
        document.getElementById('newTaskProgress').value = '0';
        document.getElementById('newProgressValue').textContent = '0%';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskRepeat').value = 'none';
        document.getElementById('taskRepeatUntil').value = '';
        document.getElementById('repeatUntilContainer').style.display = 'none';
        
        // Clear rich text editor
        if (this.newTaskNotesEditor) {
            this.newTaskNotesEditor.clear();
        }
        
        // Collapse the expanded form
        if (this.taskFormExpanded) {
            this.toggleTaskForm();
        }
    }

    deleteTask(taskId) {
        this.tasks = this.tasks.filter(task => task.id !== taskId);
        this.saveTasksToStorage();
        
        // Also delete from Firebase if available
        if (this.useFirebase && window.firebaseManager) {
            window.firebaseManager.deleteTask(taskId);
        }
        
        this.renderTasks();
        this.updateStatistics();
    }

    toggleTaskCompletion(taskId) {
        const task = this.findTaskById(taskId);
        if (task) {
            task.completed = !task.completed;
            task.completedAt = task.completed ? new Date().toISOString() : null;
            
            // Also toggle subtasks
            this.toggleSubtasksCompletion(task.subtasks, task.completed);
            
            // If task is being completed and has recurring settings, create new occurrence
            if (task.completed && task.repeatType && task.repeatType !== 'none') {
                this.createRecurringTask(task);
            }
            
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    createRecurringTask(originalTask) {
        if (!originalTask.dueDate || !originalTask.repeatUntil) return;
        
        const nextDueDate = this.calculateNextDueDate(originalTask.dueDate, originalTask.repeatType);
        const repeatUntilDate = new Date(originalTask.repeatUntil);
        
        // Only create if next due date is within the repeat until date
        if (nextDueDate <= repeatUntilDate) {
            const newTask = {
                ...originalTask,
                id: this.generateId(),
                completed: false,
                completedAt: null,
                dueDate: nextDueDate.toISOString(),
                createdAt: new Date().toISOString(),
                subtasks: [] // Start with empty subtasks for recurring task
            };
            
            this.tasks.unshift(newTask);
            console.log(`Created recurring task: ${newTask.text} due ${nextDueDate.toLocaleDateString()}`);
        }
    }

    calculateNextDueDate(currentDueDate, repeatType) {
        const currentDate = new Date(currentDueDate);
        const nextDate = new Date(currentDate);
        
        switch (repeatType) {
            case 'daily':
                nextDate.setDate(nextDate.getDate() + 1);
                break;
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
            default:
                return currentDate;
        }
        
        return nextDate;
    }

    // Check for missed recurring tasks on page load
    processOverdueRecurringTasks() {
        const now = new Date();
        
        this.tasks.forEach(task => {
            if (task.completed && task.repeatType && task.repeatType !== 'none' && 
                task.dueDate && task.repeatUntil && task.completedAt) {
                
                const completedAt = new Date(task.completedAt);
                const originalDueDate = new Date(task.dueDate);
                const repeatUntilDate = new Date(task.repeatUntil);
                
                // Check if we need to create recurring tasks that were missed
                let nextDueDate = this.calculateNextDueDate(task.dueDate, task.repeatType);
                
                while (nextDueDate <= now && nextDueDate <= repeatUntilDate) {
                    // Check if we already have a task for this date
                    const existingTask = this.tasks.find(t => 
                        t.text === task.text && 
                        t.dueDate && 
                        Math.abs(new Date(t.dueDate) - nextDueDate) < 24 * 60 * 60 * 1000 // Within 24 hours
                    );
                    
                    if (!existingTask) {
                        const newTask = {
                            ...task,
                            id: this.generateId(),
                            completed: false,
                            completedAt: null,
                            dueDate: nextDueDate.toISOString(),
                            createdAt: new Date().toISOString(),
                            subtasks: []
                        };
                        
                        this.tasks.unshift(newTask);
                        console.log(`Created missed recurring task: ${newTask.text} due ${nextDueDate.toLocaleDateString()}`);
                    }
                    
                    nextDueDate = this.calculateNextDueDate(nextDueDate.toISOString(), task.repeatType);
                }
            }
        });
    }

    toggleSubtasksCompletion(subtasks, completed) {
        subtasks.forEach(subtask => {
            subtask.completed = completed;
            subtask.completedAt = completed ? new Date().toISOString() : null;
            if (subtask.subtasks && subtask.subtasks.length > 0) {
                this.toggleSubtasksCompletion(subtask.subtasks, completed);
            }
        });
    }

    archiveTask(taskId) {
        const task = this.findTaskById(taskId);
        if (task) {
            task.archived = !task.archived;
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    addSubtask(parentId, text) {
        const parent = this.findTaskById(parentId);
        if (parent && text.trim()) {
            const subtask = {
                id: this.generateId(),
                text: text.trim(),
                completed: false,
                priority: 'medium',
                dueDate: null,
                createdAt: new Date().toISOString(),
                notes: '',
                tags: [],
                progress: 0,
                archived: false,
                subtasks: []
            };
            
            parent.subtasks.push(subtask);
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    findTaskById(id, tasks = this.tasks) {
        for (const task of tasks) {
            if (task.id === id) return task;
            if (task.subtasks && task.subtasks.length > 0) {
                const found = this.findTaskById(id, task.subtasks);
                if (found) return found;
            }
        }
        return null;
    }

    updateTask(taskId, updates) {
        const task = this.findTaskById(taskId);
        if (task) {
            Object.assign(task, updates);
            this.saveTasksToStorage();
            
            // Also update in Firebase if available
            if (this.useFirebase && window.firebaseManager) {
                window.firebaseManager.saveTask(task);
            }
            
            this.renderTasks();
            this.updateStatistics();
        }
    }

    // Filtering and Sorting
    getFilteredTasks() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        const priorityFilter = document.getElementById('priorityFilter').value;

        return this.tasks.filter(task => {
            // Search filter
            const matchesSearch = !searchTerm || 
                task.text.toLowerCase().includes(searchTerm) ||
                task.notes.toLowerCase().includes(searchTerm) ||
                task.tags.some(tag => tag.toLowerCase().includes(searchTerm));

            // Status filter
            let matchesStatus = true;
            if (statusFilter) {
                switch (statusFilter) {
                    case 'completed':
                        matchesStatus = task.completed;
                        break;
                    case 'pending':
                        matchesStatus = !task.completed;
                        break;
                    case 'overdue':
                        matchesStatus = this.isTaskOverdue(task);
                        break;
                    case 'due-soon':
                        matchesStatus = this.isTaskDueSoon(task);
                        break;
                }
            }

            // Priority filter
            const matchesPriority = !priorityFilter || task.priority === priorityFilter;

            return matchesSearch && matchesStatus && matchesPriority;
        }).sort((a, b) => {
            // Sort by completion status (incomplete first)
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }

            // Sort by priority
            const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
            const aPriority = priorityOrder[a.priority] || 3;
            const bPriority = priorityOrder[b.priority] || 3;
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }

            // Sort by due date
            if (a.dueDate && b.dueDate) {
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;

            // Sort by creation date (newest first)
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }

    isTaskOverdue(task) {
        return task.dueDate && !task.completed && new Date(task.dueDate) < new Date();
    }

    isTaskDueSoon(task) {
        if (!task.dueDate || task.completed) return false;
        const now = new Date();
        const dueDate = new Date(task.dueDate);
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 3;
    }

    // Rendering
    renderTasks() {
        const container = document.getElementById('tasksContainer');
        const emptyState = document.getElementById('emptyState');
        const filteredTasks = this.getFilteredTasks();

        // Clear existing tasks AND subtask containers
        const existingTasks = container.querySelectorAll('.task-card');
        existingTasks.forEach(task => task.remove());
        
        const existingSubtaskContainers = container.querySelectorAll('.subtask-container');
        existingSubtaskContainers.forEach(container => container.remove());

        if (filteredTasks.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            filteredTasks.forEach(task => {
                this.renderTaskCard(task, container);
            });
        }
    }

    renderTaskCard(task, container, isSubtask = false) {
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card drop-zone';
        taskCard.dataset.taskId = task.id;
        taskCard.draggable = true;

        // Add status classes
        if (task.completed) taskCard.classList.add('completed');
        if (this.isTaskOverdue(task)) taskCard.classList.add('overdue');
        if (this.isTaskDueSoon(task)) taskCard.classList.add('due-soon');

        // Task Header
        const header = document.createElement('div');
        header.className = 'task-header';

        const headerContent = document.createElement('div');
        headerContent.className = 'flex items-start gap-3';

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox mt-1';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => this.toggleTaskCompletion(task.id));

        // Task Content
        const content = document.createElement('div');
        content.className = 'task-content';

        // Task Text
        const taskText = document.createElement('div');
        taskText.className = 'task-text';
        
        // Create container for task text and subtask toggle
        const taskTextContainer = document.createElement('div');
        taskTextContainer.className = 'flex items-center justify-between';
        
        const textContent = document.createElement('div');
        textContent.innerHTML = marked.parse(task.text);
        taskTextContainer.appendChild(textContent);
        
        // Add subtask toggle if task has subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            const subtaskToggle = document.createElement('button');
            subtaskToggle.className = 'subtask-toggle';
            subtaskToggle.innerHTML = '▼';
            subtaskToggle.title = 'Click to hide subtasks';
            subtaskToggle.onclick = (e) => {
                e.stopPropagation();
                this.simpleToggleSubtasks(task.id);
                // Update button text after toggle
                const container = document.querySelector(`[data-parent-task-id="${task.id}"]`);
                if (container && container.style.display === 'none') {
                    subtaskToggle.innerHTML = '▶';
                    subtaskToggle.title = 'Click to show subtasks';
                } else {
                    subtaskToggle.innerHTML = '▼';
                    subtaskToggle.title = 'Click to hide subtasks';
                }
            };
            
            taskTextContainer.appendChild(subtaskToggle);
        }
        
        taskText.appendChild(taskTextContainer);
        content.appendChild(taskText);

        // Task Notes (if present)
        if (task.notes && task.notes.trim()) {
            const notesContainer = document.createElement('div');
            notesContainer.className = 'task-notes mt-2 p-2 bg-slate-800/50 rounded border-l-2 border-blue-500/30';
            
            // If notes contain HTML (from rich text editor), display as HTML, otherwise parse as markdown
            if (task.notes.includes('<') && task.notes.includes('>')) {
                notesContainer.innerHTML = task.notes;
            } else {
                notesContainer.innerHTML = marked.parse(task.notes);
            }
            
            // Make links clickable and open in new tab
            this.makeLinksClickable(notesContainer);
            
            content.appendChild(notesContainer);
        }

        // Progress Bar
        if (task.progress > 0) {
            const progressContainer = document.createElement('div');
            progressContainer.className = 'mb-2';
            
            const progressLabel = document.createElement('div');
            progressLabel.className = 'text-sm text-slate-400 mb-1';
            progressLabel.textContent = `Progress: ${task.progress}%`;
            
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            
            const progressFill = document.createElement('div');
            progressFill.className = 'progress-fill';
            progressFill.style.width = `${task.progress}%`;
            
            progressBar.appendChild(progressFill);
            progressContainer.appendChild(progressLabel);
            progressContainer.appendChild(progressBar);
            content.appendChild(progressContainer);
        }

        // Tags
        if (task.tags && task.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'flex flex-wrap gap-1 mb-2';
            
            task.tags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'tag';
                tagElement.textContent = tag;
                tagsContainer.appendChild(tagElement);
            });
            
            content.appendChild(tagsContainer);
        }

        // Priority Tag
        const priorityTag = document.createElement('span');
        priorityTag.className = `tag priority-${task.priority}`;
        priorityTag.textContent = `${this.getPriorityIcon(task.priority)} ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`;
        
        const priorityContainer = document.createElement('div');
        priorityContainer.className = 'flex gap-1 mb-2';
        priorityContainer.appendChild(priorityTag);
        
        // Recurring Tag (if task has recurring settings)
        if (task.repeatType && task.repeatType !== 'none') {
            const recurringTag = document.createElement('span');
            recurringTag.className = 'tag recurring-tag';
            const repeatIcon = task.repeatType === 'daily' ? '🔁' : task.repeatType === 'weekly' ? '📅' : '📆';
            const untilDate = task.repeatUntil ? new Date(task.repeatUntil).toLocaleDateString() : '';
            recurringTag.textContent = `${repeatIcon} ${task.repeatType.charAt(0).toUpperCase() + task.repeatType.slice(1)}${untilDate ? ` until ${untilDate}` : ''}`;
            recurringTag.title = `Repeats ${task.repeatType}${untilDate ? ` until ${untilDate}` : ''}`;
            priorityContainer.appendChild(recurringTag);
        }
        
        content.appendChild(priorityContainer);

        // Action Buttons
        const actions = document.createElement('div');
        actions.className = 'task-actions';

        // Edit Button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-icon';
        editBtn.innerHTML = '✏️';
        editBtn.title = 'Edit Task';
        editBtn.addEventListener('click', () => this.openEditModal(task));

        // Add Subtask Button
        const addSubtaskBtn = document.createElement('button');
        addSubtaskBtn.className = 'btn-icon';
        addSubtaskBtn.innerHTML = '➕';
        addSubtaskBtn.title = 'Add Subtask';
        addSubtaskBtn.addEventListener('click', () => this.promptAddSubtask(task.id));

        // Archive Button
        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'btn-icon';
        archiveBtn.innerHTML = task.archived ? '📤' : '📦';
        archiveBtn.title = task.archived ? 'Unarchive' : 'Archive';
        archiveBtn.addEventListener('click', () => this.archiveTask(task.id));

        // Delete Button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon text-red-400';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete Task';
        deleteBtn.addEventListener('click', () => this.confirmDelete(task.id));

        actions.appendChild(editBtn);
        actions.appendChild(addSubtaskBtn);
        actions.appendChild(archiveBtn);
        actions.appendChild(deleteBtn);

        headerContent.appendChild(checkbox);
        headerContent.appendChild(content);
        headerContent.appendChild(actions);
        header.appendChild(headerContent);
        taskCard.appendChild(header);

        // Task Footer
        const footer = document.createElement('div');
        footer.className = 'task-footer flex items-center justify-between';

        const leftMeta = document.createElement('div');
        leftMeta.className = 'flex items-center gap-4';

        const createdSpan = document.createElement('span');
        createdSpan.innerHTML = `📅 Created: ${this.formatDateTime(task.createdAt)}`;
        leftMeta.appendChild(createdSpan);

        if (task.dueDate) {
            const dueSpan = document.createElement('span');
            dueSpan.innerHTML = `⏰ Due: ${this.formatDateTime(task.dueDate)}`;
            leftMeta.appendChild(dueSpan);
        }

        const rightMeta = document.createElement('div');
        rightMeta.className = 'text-xs text-slate-500';
        rightMeta.textContent = `ID: ${task.id}`;

        footer.appendChild(leftMeta);
        footer.appendChild(rightMeta);
        taskCard.appendChild(footer);

        container.appendChild(taskCard);

        // Render Subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            const subtaskContainer = document.createElement('div');
            subtaskContainer.className = 'subtask-container';
            subtaskContainer.setAttribute('data-parent-task-id', task.id);
            
            task.subtasks.forEach(subtask => {
                this.renderTaskCard(subtask, subtaskContainer, true);
            });
            
            container.appendChild(subtaskContainer);
        }

        // Add drag and drop listeners
        this.addDragListeners(taskCard, task);
    }

    // Drag and Drop
    addDragListeners(element, task) {
        element.addEventListener('dragstart', (e) => {
            this.draggedTask = task;
            element.classList.add('drag-preview');
            e.dataTransfer.effectAllowed = 'move';
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('drag-preview');
            this.draggedTask = null;
            // Remove all drop indicators
            document.querySelectorAll('.drop-zone').forEach(zone => {
                zone.classList.remove('drop-above', 'drop-below', 'drop-inside');
            });
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this.draggedTask || this.draggedTask.id === task.id) return;
            
            const rect = element.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;
            
            // Remove previous indicators
            element.classList.remove('drop-above', 'drop-below', 'drop-inside');
            
            if (y < height * 0.25) {
                element.classList.add('drop-above');
            } else if (y > height * 0.75) {
                element.classList.add('drop-below');
            } else {
                element.classList.add('drop-inside');
            }
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.draggedTask || this.draggedTask.id === task.id) return;
            
            // Handle the drop logic here
            console.log('Dropped task:', this.draggedTask.id, 'on:', task.id);
            // You can implement reordering logic here
            
            element.classList.remove('drop-above', 'drop-below', 'drop-inside');
        });
    }

    // Modal Management
    openEditModal(task) {
        this.currentEditingTask = task;
        
        document.getElementById('editTaskText').value = task.text;
        document.getElementById('editTaskPriority').value = task.priority;
        document.getElementById('editTaskDueDate').value = task.dueDate ? task.dueDate.slice(0, 16) : '';
        document.getElementById('editTaskTags').value = task.tags ? task.tags.join(', ') : '';
        document.getElementById('editTaskProgress').value = task.progress || 0;
        document.getElementById('editProgressValue').textContent = `${task.progress || 0}%`;
        document.getElementById('editTaskRepeat').value = task.repeatType || 'none';
        document.getElementById('editTaskRepeatUntil').value = task.repeatUntil ? task.repeatUntil.slice(0, 10) : '';
        
        // Show/hide repeat until field based on repeat selection
        const repeatUntilContainer = document.getElementById('editRepeatUntilContainer');
        if (task.repeatType && task.repeatType !== 'none') {
            repeatUntilContainer.style.display = 'block';
        } else {
            repeatUntilContainer.style.display = 'none';
        }
        
        // Set rich text editor content
        if (this.editTaskNotesEditor) {
            this.editTaskNotesEditor.setContent(task.notes || '');
        }
        
        this.showModal('editTaskModal');
    }

    saveTaskChanges() {
        if (!this.currentEditingTask) return;
        
        const updates = {
            text: document.getElementById('editTaskText').value.trim(),
            notes: this.editTaskNotesEditor ? this.editTaskNotesEditor.getContent() : '',
            priority: document.getElementById('editTaskPriority').value,
            dueDate: document.getElementById('editTaskDueDate').value || null,
            tags: document.getElementById('editTaskTags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
            progress: parseInt(document.getElementById('editTaskProgress').value),
            repeatType: document.getElementById('editTaskRepeat').value,
            repeatUntil: document.getElementById('editTaskRepeatUntil').value || null
        };
        
        this.updateTask(this.currentEditingTask.id, updates);
        this.closeModal('editTaskModal');
        this.currentEditingTask = null;
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    confirmDelete(taskId) {
        const task = this.findTaskById(taskId);
        document.getElementById('confirmMessage').textContent = `Are you sure you want to delete "${task.text}"?`;
        
        const confirmBtn = document.getElementById('confirmBtn');
        confirmBtn.onclick = () => {
            this.deleteTask(taskId);
            this.closeModal('confirmModal');
        };
        
        this.showModal('confirmModal');
    }

    promptAddSubtask(parentId) {
        const text = prompt('Enter subtask text:');
        if (text) {
            this.addSubtask(parentId, text);
        }
    }

    // Statistics
    updateStatistics() {
        const allTasks = this.getAllTasks(this.tasks);
        const completed = allTasks.filter(task => task.completed);
        const overdue = allTasks.filter(task => this.isTaskOverdue(task));
        const dueSoon = allTasks.filter(task => this.isTaskDueSoon(task));
        
        const completionRate = allTasks.length > 0 ? Math.round((completed.length / allTasks.length) * 100) : 0;
        
        document.getElementById('totalTasks').textContent = allTasks.length;
        document.getElementById('completedTasks').textContent = completed.length;
        document.getElementById('overdueTasks').textContent = overdue.length;
        document.getElementById('dueSoonTasks').textContent = dueSoon.length;
        document.getElementById('completionPercentage').textContent = `${completionRate}%`;
        document.getElementById('progressBar').style.width = `${completionRate}%`;
    }

    getAllTasks(tasks) {
        let allTasks = [];
        tasks.forEach(task => {
            allTasks.push(task);
            if (task.subtasks && task.subtasks.length > 0) {
                allTasks = allTasks.concat(this.getAllTasks(task.subtasks));
            }
        });
        return allTasks;
    }

    // Storage
    saveTasksToStorage() {
        try {
            localStorage.setItem('gtd-tasks', JSON.stringify(this.tasks));
            
            // Also save to Firebase if available (batch update)
            if (this.useFirebase && window.firebaseManager) {
                window.firebaseManager.saveAllTasks(this.tasks);
            }
        } catch (error) {
            console.error('Failed to save tasks:', error);
        }
    }

    async loadTasksFromStorage() {
        try {
            // Try to load from Firebase first if available
            if (this.useFirebase && window.firebaseManager) {
                const firebaseTasks = await window.firebaseManager.loadTasks();
                if (firebaseTasks.length > 0) {
                    this.tasks = firebaseTasks;
                    // Also update localStorage as backup
                    localStorage.setItem('gtd-tasks', JSON.stringify(this.tasks));
                    return;
                }
            }
            
            // Fallback to localStorage
            const stored = localStorage.getItem('gtd-tasks');
            if (stored) {
                this.tasks = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
            this.tasks = [];
        }
    }

    // Import/Export
    exportToCSV() {
        const allTasks = this.getAllTasks(this.tasks);
        const headers = ['Text', 'Priority', 'Status', 'Created', 'Due Date', 'Progress', 'Tags', 'Notes'];
        const csvContent = [
            headers.join(','),
            ...allTasks.map(task => [
                `"${task.text.replace(/"/g, '""')}"`,
                task.priority,
                task.completed ? 'Completed' : 'Pending',
                this.formatDateTime(task.createdAt),
                task.dueDate ? this.formatDateTime(task.dueDate) : '',
                `${task.progress}%`,
                `"${task.tags.join(', ')}"`,
                `"${(task.notes || '').replace(/"/g, '""')}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gtd-tasks-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    importTasks() {
        document.getElementById('fileInput').click();
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    this.tasks = imported;
                    this.saveTasksToStorage();
                    this.renderTasks();
                    this.updateStatistics();
                    alert('Tasks imported successfully!');
                }
            } catch (error) {
                alert('Failed to import tasks. Please check the file format.');
            }
        };
        reader.readAsText(file);
    }

    // UI Helpers
    toggleTaskForm() {
        const expandedForm = document.getElementById('expandedTaskForm');
        const expandBtn = document.getElementById('expandTaskFormBtn');
        
        this.taskFormExpanded = !this.taskFormExpanded;
        
        if (this.taskFormExpanded) {
            expandedForm.classList.remove('hidden');
            expandedForm.classList.add('show');
            expandBtn.innerHTML = '🔼';
            expandBtn.title = 'Less Options';
        } else {
            expandedForm.classList.add('hidden');
            expandedForm.classList.remove('show');
            expandBtn.innerHTML = '⚙️';
            expandBtn.title = 'More Options';
        }
    }

    toggleFilterDrawer() {
        const drawer = document.getElementById('filterDrawer');
        const icon = document.getElementById('filterToggleIcon');
        
        this.filterDrawerExpanded = !this.filterDrawerExpanded;
        
        if (this.filterDrawerExpanded) {
            drawer.classList.remove('collapsed');
            drawer.classList.add('expanded');
            icon.textContent = '▲';
        } else {
            drawer.classList.remove('expanded');
            drawer.classList.add('collapsed');
            icon.textContent = '▼';
        }
    }

    toggleDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId).parentElement;
        const isActive = dropdown.classList.contains('active');
        
        // Close all dropdowns
        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
        
        // Toggle clicked dropdown
        if (!isActive) {
            dropdown.classList.add('active');
        }
    }

    clearCompleted() {
        if (confirm('Are you sure you want to delete all completed tasks?')) {
            this.tasks = this.tasks.filter(task => !task.completed);
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    // Service Worker
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW registered:', registration);
                })
                .catch(error => {
                    console.log('SW registration failed:', error);
                });
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Add task
        document.getElementById('addTaskBtn').addEventListener('click', () => {
            const text = document.getElementById('newTaskInput').value;
            const priority = document.getElementById('taskPriority').value;
            const dueDate = document.getElementById('taskDueDate').value || null;
            const notes = this.newTaskNotesEditor ? this.newTaskNotesEditor.getContent() : '';
            const tags = document.getElementById('newTaskTags').value
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag);
            const progress = parseInt(document.getElementById('newTaskProgress').value) || 0;
            const repeatType = document.getElementById('taskRepeat').value;
            const repeatUntil = document.getElementById('taskRepeatUntil').value || null;
            
            this.addTask(text, priority, dueDate, notes, tags, progress, repeatType, repeatUntil);
        });

        // Enter key for add task
        document.getElementById('newTaskInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const text = document.getElementById('newTaskInput').value;
                const priority = document.getElementById('taskPriority').value;
                const dueDate = document.getElementById('taskDueDate').value || null;
                const notes = this.newTaskNotesEditor ? this.newTaskNotesEditor.getContent() : '';
                const tags = document.getElementById('newTaskTags').value
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag);
                const progress = parseInt(document.getElementById('newTaskProgress').value) || 0;
                const repeatType = document.getElementById('taskRepeat').value;
                const repeatUntil = document.getElementById('taskRepeatUntil').value || null;
                
                this.addTask(text, priority, dueDate, notes, tags, progress, repeatType, repeatUntil);
            }
        });

        // Expand task form
        document.getElementById('expandTaskFormBtn').addEventListener('click', () => this.toggleTaskForm());
        
        // Progress slider for new task
        document.getElementById('newTaskProgress').addEventListener('input', (e) => {
            document.getElementById('newProgressValue').textContent = `${e.target.value}%`;
        });

        // Filters
        document.getElementById('searchInput').addEventListener('input', () => this.renderTasks());
        document.getElementById('statusFilter').addEventListener('change', () => this.renderTasks());
        document.getElementById('priorityFilter').addEventListener('change', () => this.renderTasks());

        // Statistics toggle
        document.getElementById('toggleStats').addEventListener('click', () => {
            const panel = document.getElementById('statsPanel');
            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                this.updateStatistics();
            } else {
                panel.classList.add('hidden');
            }
        });

        document.getElementById('closeStats').addEventListener('click', () => {
            document.getElementById('statsPanel').classList.add('hidden');
        });

        // Edit modal
        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTaskChanges());
        
        // Progress slider
        document.getElementById('editTaskProgress').addEventListener('input', (e) => {
            document.getElementById('editProgressValue').textContent = `${e.target.value}%`;
        });

        // Export/Import
        document.getElementById('exportCsv').addEventListener('click', () => this.exportToCSV());
        document.getElementById('importTasks').addEventListener('click', () => this.importTasks());
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));

        // Print
        document.getElementById('printTasks').addEventListener('click', () => window.print());

        // Clear completed
        document.getElementById('clearCompleted').addEventListener('click', () => this.clearCompleted());

        // Firebase controls
        document.getElementById('signOutBtn')?.addEventListener('click', () => {
            if (window.firebaseManager) {
                window.firebaseManager.signOut();
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
            }
        });

        // Close modals when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
                setTimeout(() => {
                    e.target.style.display = 'none';
                }, 300);
            }
        });

        // Recurring task event listeners
        document.getElementById('taskRepeat').addEventListener('change', (e) => {
            const repeatUntilContainer = document.getElementById('repeatUntilContainer');
            if (e.target.value !== 'none') {
                repeatUntilContainer.style.display = 'block';
            } else {
                repeatUntilContainer.style.display = 'none';
                document.getElementById('taskRepeatUntil').value = '';
            }
        });

        document.getElementById('editTaskRepeat').addEventListener('change', (e) => {
            const repeatUntilContainer = document.getElementById('editRepeatUntilContainer');
            if (e.target.value !== 'none') {
                repeatUntilContainer.style.display = 'block';
            } else {
                repeatUntilContainer.style.display = 'none';
                document.getElementById('editTaskRepeatUntil').value = '';
            }
        });

        // Recurring task event listeners
        document.getElementById('taskRepeat').addEventListener('change', (e) => {
            const repeatUntilContainer = document.getElementById('repeatUntilContainer');
            if (e.target.value !== 'none') {
                repeatUntilContainer.style.display = 'block';
            } else {
                repeatUntilContainer.style.display = 'none';
                document.getElementById('taskRepeatUntil').value = '';
            }
        });

        document.getElementById('editTaskRepeat').addEventListener('change', (e) => {
            const repeatUntilContainer = document.getElementById('editRepeatUntilContainer');
            if (e.target.value !== 'none') {
                repeatUntilContainer.style.display = 'block';
            } else {
                repeatUntilContainer.style.display = 'none';
                document.getElementById('editTaskRepeatUntil').value = '';
            }
        });
    }
}

// Global functions for HTML onclick handlers
function toggleFilterDrawer() {
    window.gtdApp.toggleFilterDrawer();
}

function toggleDropdown(id) {
    window.gtdApp.toggleDropdown(id);
}

function closeModal(id) {
    window.gtdApp.closeModal(id);
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gtdApp = new GTDTaskManager();
});
