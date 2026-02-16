import React, { useRef, useState } from 'react';
import { Upload, FileArchive } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndPass(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndPass(e.target.files[0]);
    }
  };

  const validateAndPass = (file: File) => {
    if (file.name.endsWith('.zip') || file.type.includes('zip') || file.type.includes('compressed')) {
      onFileSelect(file);
    } else {
      alert("Please upload a ZIP file.");
    }
  };

  return (
    <div 
      className={`w-full max-w-2xl mx-auto h-80 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-8 text-center cursor-pointer group
        ${isDragging 
          ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
        }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={inputRef} 
        onChange={handleChange} 
        className="hidden" 
        accept=".zip,application/zip,application/x-zip-compressed"
      />
      
      <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20 group-hover:scale-110 transition-transform duration-300`}>
        {isDragging ? <Upload className="w-10 h-10 text-white" /> : <FileArchive className="w-10 h-10 text-white" />}
      </div>
      
      <h3 className="text-2xl font-bold mb-2 text-white">
        {isDragging ? 'Drop it like it\'s hot!' : 'Drop your project ZIP here'}
      </h3>
      <p className="text-slate-400 max-w-md">
        Upload your Google AI Studio export or any source code ZIP. <br/>
        We'll extract the text files to understand your product.
      </p>
    </div>
  );
};