
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for PDF.js dynamically
const pdfjsVersion = pdfjsLib.version || '5.4.449';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

export interface PdfPageImage {
    pageNumber: number;
    imageUrl: string; // Data URL
    width: number;
    height: number;
}

export const renderPdfToImages = async (file: File): Promise<PdfPageImage[]> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        // Convert to Uint8Array for compatibility
        const data = new Uint8Array(arrayBuffer);
        
        const loadingTask = pdfjsLib.getDocument({ 
            data,
            cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/cmaps/`,
            cMapPacked: true 
        });
        const pdf = await loadingTask.promise;
        
        const pages: PdfPageImage[] = [];
        
        // Iterate through all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            
            // Determine scale - we want high quality but manageable size
            // Standard viewport at 1.5 scale usually gives good readability
            const viewport = page.getViewport({ scale: 1.5 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (!context) continue;
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext as any).promise;
            
            pages.push({
                pageNumber: i,
                imageUrl: canvas.toDataURL('image/jpeg', 0.8), // JPEG for better compression than PNG
                width: viewport.width,
                height: viewport.height
            });
        }
        
        return pages;
    } catch (error) {
        console.error("PDF Rendering Error", error);
        throw new Error("Failed to render PDF. Ensure it is a valid PDF file.");
    }
};
