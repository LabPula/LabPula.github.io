// Rich Text Editor Component for GTD Task Manager

class RichTextEditor {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            placeholder: options.placeholder || 'Add detailed notes...',
            maxHeight: options.maxHeight || '300px',
            minHeight: options.minHeight || '120px'
        };
        
        this.activeFormats = new Set();
        this.urlDialog = null;
        
        this.init();
    }

    init() {
        if (!this.container) return;
        
        this.createEditor();
        this.attachEventListeners();
    }

    createEditor() {
        this.container.innerHTML = `
            <div class="rich-text-container">
                <div class="rich-text-toolbar">
                    <button class="rich-text-btn" data-command="bold" title="Bold (Ctrl+B)">
                        <strong>B</strong>
                    </button>
                    <button class="rich-text-btn" data-command="italic" title="Italic (Ctrl+I)">
                        <em>I</em>
                    </button>
                    <button class="rich-text-btn" data-command="underline" title="Underline (Ctrl+U)">
                        <u>U</u>
                    </button>
                    
                    <div class="rich-text-separator"></div>
                    
                    <button class="rich-text-btn" data-command="insertUnorderedList" title="Bullet List">
                        •
                    </button>
                    <button class="rich-text-btn" data-command="insertOrderedList" title="Numbered List">
                        1.
                    </button>
                    
                    <div class="rich-text-separator"></div>
                    
                    <button class="rich-text-btn" data-command="createLink" title="Insert Link (Ctrl+K)">
                        🔗
                    </button>
                    <button class="rich-text-btn" data-command="unlink" title="Remove Link">
                        🔗✕
                    </button>
                    
                    <div class="rich-text-separator"></div>
                    
                    <button class="rich-text-btn" data-command="formatBlock" data-value="blockquote" title="Quote">
                        ❝
                    </button>
                    <button class="rich-text-btn" data-command="formatBlock" data-value="p" title="Normal Text">
                        ¶
                    </button>
                    
                    <div class="rich-text-separator"></div>
                    
                    <button class="rich-text-btn" data-command="removeFormat" title="Clear Formatting">
                        ✕
                    </button>
                </div>
                
                <div contenteditable="true" 
                     class="rich-text-editor" 
                     data-placeholder="${this.options.placeholder}"
                     style="min-height: ${this.options.minHeight}; max-height: ${this.options.maxHeight}">
                </div>
            </div>
        `;

        this.toolbar = this.container.querySelector('.rich-text-toolbar');
        this.editor = this.container.querySelector('.rich-text-editor');
    }

    attachEventListeners() {
        // Toolbar button clicks
        this.toolbar.addEventListener('click', (e) => {
            const button = e.target.closest('.rich-text-btn');
            if (!button) return;
            
            e.preventDefault();
            this.handleCommand(button);
        });

        // Editor events
        this.editor.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.editor.addEventListener('input', () => this.updateToolbar());
        this.editor.addEventListener('mouseup', () => this.updateToolbar());
        this.editor.addEventListener('keyup', () => this.updateToolbar());
        
        // Placeholder handling
        this.editor.addEventListener('focus', () => this.handlePlaceholder());
        this.editor.addEventListener('blur', () => this.handlePlaceholder());
        
        // Prevent default link behavior in editor
        this.editor.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                // Show link edit dialog when clicking on existing links
                this.editExistingLink(e.target);
            }
        });
        
        // Show link preview on hover
        this.editor.addEventListener('mouseover', (e) => {
            if (e.target.tagName === 'A') {
                e.target.title = `Link: ${e.target.href}`;
            }
        });
    }

    handleCommand(button) {
        const command = button.dataset.command;
        const value = button.dataset.value;
        
        this.editor.focus();
        
        if (command === 'createLink') {
            this.insertSimpleLink();
            return;
        }
        
        if (command === 'formatBlock' && value) {
            document.execCommand(command, false, value);
        } else {
            document.execCommand(command, false, value);
        }
        
        this.updateToolbar();
    }

    handleKeydown(e) {
        // Handle keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    document.execCommand('bold');
                    this.updateToolbar();
                    break;
                case 'i':
                    e.preventDefault();
                    document.execCommand('italic');
                    this.updateToolbar();
                    break;
                case 'u':
                    e.preventDefault();
                    document.execCommand('underline');
                    this.updateToolbar();
                    break;
                case 'k':
                    e.preventDefault();
                    this.insertSimpleLink();
                    break;
            }
        }
        
        // Handle Enter key in lists
        if (e.key === 'Enter') {
            // Let browser handle list behavior naturally
        }
    }

    insertSimpleLink() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        this.hideLinkDialog(); // Hide any existing dialog
        
        const selectedText = selection.toString().trim();
        const currentRange = selection.getRangeAt(0);
        
        // Create link dialog
        const dialog = document.createElement('div');
        dialog.className = 'url-dialog';
        dialog.innerHTML = `
            <input type="url" placeholder="Enter URL (https://...)" value="${selectedText.startsWith('http') ? selectedText : ''}" class="url-input">
            <input type="text" placeholder="Link text" value="${selectedText}" class="text-input">
            <div class="url-dialog-buttons">
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary insert-btn">Insert Link</button>
            </div>
        `;
        
        this.container.appendChild(dialog);
        this.urlDialog = dialog;
        
        const urlInput = dialog.querySelector('.url-input');
        const textInput = dialog.querySelector('.text-input');
        const insertBtn = dialog.querySelector('.insert-btn');
        const cancelBtn = dialog.querySelector('.cancel-btn');
        
        urlInput.focus();
        if (selectedText.startsWith('http')) {
            urlInput.select();
        }
        
        insertBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            const text = textInput.value.trim() || url;
            
            if (url) {
                try {
                    // Restore the selection
                    selection.removeAllRanges();
                    selection.addRange(currentRange);
                    
                    // Create link element
                    const linkElement = document.createElement('a');
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
                        linkElement.href = 'https://' + url;
                    } else {
                        linkElement.href = url;
                    }
                    linkElement.textContent = text;
                    linkElement.target = '_blank';
                    linkElement.rel = 'noopener noreferrer';
                    
                    // Insert the link
                    currentRange.deleteContents();
                    currentRange.insertNode(linkElement);
                    
                    // Move cursor after the link
                    const newRange = document.createRange();
                    newRange.setStartAfter(linkElement);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    
                    // Trigger input event
                    this.editor.dispatchEvent(new Event('input', { bubbles: true }));
                } catch (error) {
                    console.error('Failed to insert link:', error);
                    // Fallback: use document.execCommand
                    document.execCommand('createLink', false, url);
                }
            }
            this.hideLinkDialog();
        });
        
        cancelBtn.addEventListener('click', () => {
            this.hideLinkDialog();
        });
        
        // Handle Enter key
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                insertBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
        });
    }

    editExistingLink(linkElement) {
        this.hideLinkDialog(); // Hide any existing dialog
        
        const currentUrl = linkElement.href;
        const currentText = linkElement.textContent;
        
        const dialog = document.createElement('div');
        dialog.className = 'url-dialog';
        dialog.innerHTML = `
            <input type="url" placeholder="Enter URL (https://...)" value="${currentUrl}" class="url-input">
            <input type="text" placeholder="Link text" value="${currentText}" class="text-input">
            <div class="url-dialog-buttons">
                <button class="btn-danger remove-btn">Remove Link</button>
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary update-btn">Update Link</button>
            </div>
        `;
        
        this.container.appendChild(dialog);
        this.urlDialog = dialog;
        
        const urlInput = dialog.querySelector('.url-input');
        const textInput = dialog.querySelector('.text-input');
        const updateBtn = dialog.querySelector('.update-btn');
        const cancelBtn = dialog.querySelector('.cancel-btn');
        const removeBtn = dialog.querySelector('.remove-btn');
        
        urlInput.focus();
        urlInput.select();
        
        updateBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            const text = textInput.value.trim() || url;
            
            if (url) {
                // Ensure URL has protocol
                if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
                    linkElement.href = 'https://' + url;
                } else {
                    linkElement.href = url;
                }
                linkElement.textContent = text;
            }
            this.hideLinkDialog();
            this.updateToolbar();
        });
        
        removeBtn.addEventListener('click', () => {
            // Replace link with just text
            const textNode = document.createTextNode(linkElement.textContent);
            linkElement.parentNode.replaceChild(textNode, linkElement);
            this.hideLinkDialog();
            this.updateToolbar();
        });
        
        cancelBtn.addEventListener('click', () => {
            this.hideLinkDialog();
        });
        
        // Handle Enter key
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
        });
    }

    insertLink(url, text) {
        if (!this.savedSelection) return;
        
        // Restore selection
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(this.savedSelection);
        
        // Ensure URL has protocol
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
            url = 'https://' + url;
        }
        
        // Create link
        if (selection.toString()) {
            document.execCommand('createLink', false, url);
        } else {
            // Insert new link with text
            const link = document.createElement('a');
            link.href = url;
            link.textContent = text;
            
            this.savedSelection.deleteContents();
            this.savedSelection.insertNode(link);
            
            // Move cursor after link
            const range = document.createRange();
            range.setStartAfter(link);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        this.updateToolbar();
    }

    hideLinkDialog() {
        if (this.urlDialog) {
            this.urlDialog.remove();
            this.urlDialog = null;
        }
        this.editor.focus();
    }

    updateToolbar() {
        const buttons = this.toolbar.querySelectorAll('.rich-text-btn');
        
        buttons.forEach(button => {
            const command = button.dataset.command;
            let isActive = false;
            
            try {
                if (command === 'formatBlock') {
                    const value = button.dataset.value;
                    isActive = document.queryCommandValue('formatBlock') === value;
                } else {
                    isActive = document.queryCommandState(command);
                }
            } catch (e) {
                // Some commands might not be supported
            }
            
            button.classList.toggle('active', isActive);
        });
    }

    handlePlaceholder() {
        const isEmpty = !this.editor.textContent.trim();
        
        if (isEmpty && !this.editor.querySelector('*')) {
            this.editor.style.color = '#64748b';
        } else {
            this.editor.style.color = '#e2e8f0';
        }
    }

    // Public methods
    setContent(html) {
        this.editor.innerHTML = html || '';
        this.handlePlaceholder();
    }

    getContent() {
        return this.editor.innerHTML;
    }

    getText() {
        return this.editor.textContent;
    }

    focus() {
        this.editor.focus();
    }

    clear() {
        this.editor.innerHTML = '';
        this.handlePlaceholder();
    }

    // Convert to/from markdown for compatibility
    getMarkdown() {
        const html = this.getContent();
        return this.htmlToMarkdown(html);
    }

    setMarkdown(markdown) {
        const html = this.markdownToHtml(markdown);
        this.setContent(html);
    }

    htmlToMarkdown(html) {
        // Simple HTML to Markdown conversion
        return html
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            .replace(/<u[^>]*>(.*?)<\/u>/gi, '_$1_')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1')
            .replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1')
            .replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
            .replace(/<br[^>]*>/gi, '\n')
            .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
            .trim();
    }

    markdownToHtml(markdown) {
        // Simple Markdown to HTML conversion
        if (!markdown) return '';
        
        return markdown
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/_(.*?)_/g, '<u>$1</u>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
            .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            .replace(/\n/g, '<br>');
    }
}

// Make RichTextEditor available globally
window.RichTextEditor = RichTextEditor;
