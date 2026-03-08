document.addEventListener('DOMContentLoaded', async () => {
    const gallery = document.getElementById('gallery');
    const searchInput = document.getElementById('searchInput');
    const loadingState = document.getElementById('loadingState');
    const lupaElement = document.getElementById('lupaElement');
    
    // Modal elements
    const modal = document.getElementById('transcriptionModal');
    const closeModalBtn = document.getElementById('closeModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalType = document.getElementById('modalType');
    const modalPreview = document.getElementById('modalPreview');
    const modalText = document.getElementById('modalText');
    const copyBtn = document.getElementById('copyBtn');
    const transcriptionLoading = document.getElementById('transcriptionLoading');

    // State
    const items = []; // To store DOM elements and metadata for searching

    // Initialize Tesseract worker early, but we could also do it lazily
    // We'll do it lazily when the user clicks an image to save initial load time.
    let tesseractWorker = null;

    /**
     * 1. Initialize and render the gallery
     */
    async function initGallery() {
        if (typeof documentDatabase === 'undefined' || documentDatabase.length === 0) {
            loadingState.innerHTML = '<h2>No se encontraron documentos.</h2><p>Ejecuta el script build_index.ps1 primero.</p>';
            return;
        }

        // Process sequentially to avoid crashing the browser with too many PDF.js workers
        for (let i = 0; i < documentDatabase.length; i++) {
            const path = documentDatabase[i];
            const isPdf = path.toLowerCase().endsWith('.pdf');
            const fileName = path.split('/').pop() || path;
            
            const card = document.createElement('div');
            card.className = 'card';
            
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'card-image-wrapper';
            
            const info = document.createElement('div');
            info.className = 'card-info';
            info.innerHTML = `
                <div class="filename" title="${fileName}">${fileName}</div>
                <div class="badge ${isPdf ? 'pdf' : 'jpg'}">${isPdf ? 'PDF' : 'JPG'}</div>
            `;
            
            card.appendChild(imageWrapper);
            card.appendChild(info);
            gallery.appendChild(card);

            items.push({
                element: card,
                path: path,
                fileName: fileName.toLowerCase(),
                isPdf: isPdf,
                textContent: '', // Cache for later search if transcribed
                thumbnailUrl: null
            });

            // Generate thumbnail async
            if (isPdf) {
                renderPdfThumbnail(path, imageWrapper, items[i]);
            } else {
                renderJpgThumbnail(path, imageWrapper, items[i]);
            }

            // Click event for transcription
            card.addEventListener('click', () => openTranscription(items[i]));
            
            // Lupa Hover Effects
            setupLupaEffect(card, imageWrapper, items[i]);
        }

        loadingState.classList.add('hidden');
    }

    /**
     * 2. Thumbnail Generators
     */
    function renderJpgThumbnail(path, container, itemData) {
        const img = document.createElement('img');
        img.className = 'card-thumbnail';
        img.src = path;
        img.loading = 'lazy';
        container.appendChild(img);
        itemData.thumbnailUrl = path;
    }

    async function renderPdfThumbnail(path, container, itemData) {
        try {
            const loadingText = document.createElement('div');
            loadingText.style.color = '#8b949e';
            loadingText.style.position = 'absolute';
            loadingText.style.top = '50%';
            loadingText.style.left = '50%';
            loadingText.style.transform = 'translate(-50%, -50%)';
            loadingText.style.fontSize = '0.8rem';
            loadingText.innerText = 'PDF...';
            container.appendChild(loadingText);

            const loadingTask = pdfjsLib.getDocument(path);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            
            const scale = 0.5; // low res for thumbnail
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.className = 'card-thumbnail';
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            container.innerHTML = ''; // clear loading text
            container.appendChild(canvas);
            
            // Save dataURL for lupa and modal
            itemData.thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        } catch (error) {
            console.error('Error rendering PDF thumbnail:', path, error);
            container.innerHTML = '<div style="color:red; text-align:center; padding-top:50%;">Error PDF</div>';
        }
    }

    /**
     * 3. Lupa (Magnifier) Effect
     */
    function setupLupaEffect(card, imageWrapper, itemData) {
        const LUPA_SIZE = 150; // diameter
        // Set lupa dimensions
        lupaElement.style.width = LUPA_SIZE + 'px';
        lupaElement.style.height = LUPA_SIZE + 'px';

        card.addEventListener('mouseenter', () => {
            if (!itemData.thumbnailUrl) return; // Not loaded yet
            
            lupaElement.style.display = 'block';
            lupaElement.style.backgroundImage = `url("${encodeURI(itemData.thumbnailUrl)}")`;
            // Enlarge image inside completely (adjust scale here if needed)
            lupaElement.style.backgroundSize = `${imageWrapper.offsetWidth * 2.5}px ${imageWrapper.offsetHeight * 2.5}px`;
        });

        card.addEventListener('mousemove', (e) => {
            if (!itemData.thumbnailUrl) return;

            // Follow cursor
            lupaElement.style.left = (e.clientX - LUPA_SIZE/2) + 'px';
            lupaElement.style.top = (e.clientY - LUPA_SIZE/2) + 'px';

            // Calculate position inside the image wrapper
            const rect = imageWrapper.getBoundingClientRect();
            // X and Y relative to the image wrapper, normalized between 0 and 1
            let x = (e.clientX - rect.left) / rect.width;
            let y = (e.clientY - rect.top) / rect.height;
            
            // Clamp values between 0 and 1 to prevent background moving outside bounds
            x = Math.max(0, Math.min(1, x));
            y = Math.max(0, Math.min(1, y));

            // Move the background image in the opposite direction
            lupaElement.style.backgroundPosition = `${x * 100}% ${y * 100}%`;
        });

        card.addEventListener('mouseleave', () => {
            lupaElement.style.display = 'none';
        });
    }

    /**
     * 4. Search Functionality
     */
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        
        items.forEach(item => {
            const matchesName = item.fileName.includes(query);
            const matchesText = item.textContent && item.textContent.toLowerCase().includes(query);
            
            if (matchesName || matchesText) {
                item.element.style.display = 'flex';
            } else {
                item.element.style.display = 'none';
            }
        });
    });

    /**
     * 5. Transcription logic (PDF extraction / Tesseract OCR)
     */
    async function openTranscription(itemData) {
        // Hide Lupa so it doesn't get stuck over modal
        lupaElement.style.display = 'none';

        modal.classList.add('active');
        modalTitle.innerText = itemData.fileName;
        modalType.innerText = itemData.isPdf ? 'PDF' : 'JPG';
        modalType.className = `badge ${itemData.isPdf ? 'pdf' : 'jpg'}`;
        
        // Show Preview
        modalPreview.innerHTML = '';
        if (itemData.thumbnailUrl) {
            const img = document.createElement('img');
            img.src = itemData.thumbnailUrl;
            modalPreview.appendChild(img);
        }

        // If we already transcribed this, just show it
        if (itemData.textContent) {
            modalText.value = itemData.textContent;
            transcriptionLoading.classList.add('hidden');
            return;
        }

        // Otherwise extract
        modalText.value = "";
        transcriptionLoading.classList.remove('hidden');

        try {
            if (itemData.isPdf) {
                itemData.textContent = await extractTextFromPdf(itemData.path);
            } else {
                itemData.textContent = await extractTextFromJpg(itemData.path);
            }
            modalText.value = itemData.textContent;
        } catch (err) {
            console.error("Transcription error:", err);
            modalText.value = `Error extrayendo texto: ${err.message}`;
        } finally {
            transcriptionLoading.classList.add('hidden');
        }
    }

    async function extractTextFromPdf(path) {
        const loadingTask = pdfjsLib.getDocument(path);
        const pdf = await loadingTask.promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        return fullText.trim() || 'No se encontró texto seleccionable en este PDF (podría ser una imagen escaneada).';
    }

    async function extractTextFromJpg(path) {
        if (!tesseractWorker) {
            tesseractWorker = await Tesseract.createWorker('spa'); // Load Spanish explicitly as it's an ES repo, fallback to eng if needed but spa is safer for spanish files
        }
        const { data: { text } } = await tesseractWorker.recognize(path);
        return text.trim() || 'No se pudo extraer texto de la imagen.';
    }

    // Modal Events
    closeModalBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        // If Tesseract is running we can't easily cancel it here, but we hide loader
    });

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    copyBtn.addEventListener('click', () => {
        modalText.select();
        document.execCommand('copy');
        
        const originalText = copyBtn.innerText;
        copyBtn.innerText = '¡Copiado!';
        setTimeout(() => copyBtn.innerText = originalText, 2000);
    });

    // Run initialization
    initGallery();
});
