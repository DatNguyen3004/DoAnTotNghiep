import sys
from PyPDF2 import PdfReader

def read_pdf(filepath, outpath):
    try:
        reader = PdfReader(filepath)
        with open(outpath, 'w', encoding='utf-8') as f:
            f.write(f"File: {filepath}\n")
            f.write(f"Total Pages: {len(reader.pages)}\n\n")
            for i, page in enumerate(reader.pages):
                f.write(f"--- Page {i+1} ---\n")
                text = page.extract_text()
                if text:
                    f.write(text.strip() + "\n")
                f.write("\n")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    read_pdf(sys.argv[1], sys.argv[2])
