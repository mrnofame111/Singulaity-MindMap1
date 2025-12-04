
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for PDF.js
// We use a CDN for the worker to avoid complex build configuration in this environment
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js`;

export const parseFile = async (file: File): Promise<string> => {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        return await extractTextFromPdf(file);
    } else if (
        fileType.startsWith('text/') || 
        fileName.endsWith('.txt') || 
        fileName.endsWith('.md') || 
        fileName.endsWith('.csv') ||
        fileName.endsWith('.json')
    ) {
        return await extractTextFromTextFile(file);
    } else {
        throw new Error("Unsupported file type. Please upload PDF or Text files.");
    }
};

const extractTextFromTextFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                resolve(event.target.result as string);
            } else {
                reject(new Error("Failed to read text file"));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
};

const extractTextFromPdf = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        // Iterate through all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
        }
        
        return fullText;
    } catch (error) {
        console.error("PDF Parsing Error", error);
        throw new Error("Failed to parse PDF. Ensure it is a valid text-based PDF.");
    }
};

export const isValidUrl = (str: string) => {
    try {
        new URL(str);
        return true;
    } catch (_) {
        return false;
    }
};
