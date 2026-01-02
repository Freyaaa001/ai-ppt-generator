import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileText, Wand2, Image as ImageIcon, Download, 
  ChevronLeft, ChevronRight, LayoutTemplate,
  RefreshCw, Edit3, Loader2, Save, Palette, Files,
  MessageSquare, Plus, Trash2, GripVertical,
  Briefcase, GraduationCap, Presentation, AlignLeft, AlignJustify,
  FileDown, Zap, Network, LogOut, Settings, Check, CheckCircle2, XCircle, X, ArrowLeft,
  ZoomIn, ZoomOut, Maximize, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, GripVertical as GripIcon,
  Monitor
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
// @ts-ignore
import PptxGenJS from 'pptxgenjs';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import mammoth from 'mammoth';

import { SlideData, AppStage, SlideType, SlideLayout, THEMES, AppTheme } from '../types';
import * as GeminiService from '../services/geminiService';
import SlideRenderer from './SlideRenderer';

interface PPTWorkbenchProps {
  onReset?: () => void;
}

const PPTWorkbench: React.FC<PPTWorkbenchProps> = ({ onReset }) => {
  const [stage, setStage] = useState<AppStage>(AppStage.Input);
  const [inputText, setInputText] = useState('');
  const [slideCount, setSlideCount] = useState(12);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // Theme State
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(THEMES[0]);

  // Preference State
  const [pptPurpose, setPptPurpose] = useState<string>('工作汇报');
  const [textDensity, setTextDensity] = useState<string>('standard'); // 'standard' | 'detailed'
  // New: Custom Instruction State
  const [customInstruction, setCustomInstruction] = useState('');

  // Slide Editing State
  const [editingSlide, setEditingSlide] = useState<SlideData | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  // New: Image Prompt Editing
  const [localImagePrompt, setLocalImagePrompt] = useState('');
  const [isPromptRegenerating, setIsPromptRegenerating] = useState(false);
  
  // Editor State
  const [previewScale, setPreviewScale] = useState(1.0); // Default 100%
  const [isAutoFit, setIsAutoFit] = useState(true); // Default to auto-fit
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0); // Track progress
  
  // --- Layout State (Resizable Sidebars) ---
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState('');
  const [keyTestStatus, setKeyTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // Refs
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // --- Initialization & PDF Worker Fix ---
  useEffect(() => {
    // Handle ESM/CJS interop for pdfjs-dist
    const lib = (pdfjsLib as any).default || pdfjsLib;
    if (lib && lib.GlobalWorkerOptions) {
      // FIX: Use cdnjs for the worker script. 
      // esm.sh/pdf.worker.min.js can cause "NetworkError: Failed to execute 'importScripts'" in some browsers due to CORS/MIME issues.
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }, []);

  // Settings Logic
  useEffect(() => {
    if (isSettingsOpen) {
        const k = localStorage.getItem('gemini_api_key') || '';
        setSettingsKey(k);
        setKeyTestStatus('idle');
    }
  }, [isSettingsOpen]);

  // --- Auto Fit Logic ---
  useEffect(() => {
      if (stage !== AppStage.Editor || !isAutoFit || !previewContainerRef.current) return;

      const updateScale = () => {
          if (!previewContainerRef.current) return;
          const { clientWidth, clientHeight } = previewContainerRef.current;
          
          // Safety check
          if (clientWidth === 0 || clientHeight === 0) return;

          // Padding around the slide (p-8 = 32px * 2 = 64px, plus a little buffer)
          const paddingX = 80; 
          const paddingY = 80;

          const availableWidth = Math.max(0, clientWidth - paddingX);
          const availableHeight = Math.max(0, clientHeight - paddingY);
          
          const baseWidth = 960;
          const baseHeight = 540;

          const scaleX = availableWidth / baseWidth;
          const scaleY = availableHeight / baseHeight;
          
          // Choose the smaller scale to fit both dimensions
          const fitScale = Math.min(scaleX, scaleY);
          
          setPreviewScale(Math.max(0.1, fitScale)); // Minimum scale safety
      };

      // Initial Call
      updateScale();

      // Observer
      const observer = new ResizeObserver(() => {
          // Wrap in RAF to avoid "ResizeObserver loop limit exceeded" errors
          requestAnimationFrame(updateScale);
      });
      observer.observe(previewContainerRef.current);

      return () => observer.disconnect();
  }, [stage, isAutoFit, showLeftSidebar, showRightSidebar, leftWidth, rightWidth]); 
  // Dependencies ensure it re-runs if layout configuration changes heavily, though ResizeObserver handles most.

  // --- Resizing Logic ---
  const handleMouseDownLeft = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingLeft(true);
  };

  const handleMouseDownRight = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingRight(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
      if (isDraggingLeft) {
          const newWidth = Math.max(200, Math.min(e.clientX, 500)); // Clamp between 200 and 500
          setLeftWidth(newWidth);
      }
      if (isDraggingRight) {
          const newWidth = Math.max(280, Math.min(window.innerWidth - e.clientX, 600)); // Clamp between 280 and 600
          setRightWidth(newWidth);
      }
  }, [isDraggingLeft, isDraggingRight]);

  const handleMouseUp = useCallback(() => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
  }, []);

  useEffect(() => {
      if (isDraggingLeft || isDraggingRight) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none'; // Prevent text selection
      } else {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'default';
          document.body.style.userSelect = 'auto';
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isDraggingLeft, isDraggingRight, handleMouseMove, handleMouseUp]);


  const handleTestSettingsKey = async () => {
    if(!settingsKey) return;
    setKeyTestStatus('testing');
    try {
        await GeminiService.testApiKey(settingsKey);
        setKeyTestStatus('success');
    } catch(e) {
        setKeyTestStatus('error');
    }
  };

  const handleSaveSettings = () => {
    if (settingsKey) {
         GeminiService.setApiKey(settingsKey);
         localStorage.setItem('gemini_api_key', settingsKey);
         setIsSettingsOpen(false);
         // Optional: alert("API Key 已更新");
    }
  };

  // Update local prompt when active slide changes
  useEffect(() => {
    if (slides[activeSlideIndex]) {
      setLocalImagePrompt(slides[activeSlideIndex].imagePrompt);
      setEditInstruction('');
      setEditingSlide(null);
    }
  }, [activeSlideIndex, slides]);

  // --- File Parsing Helpers ---
  const extractTextFromPdf = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Use the resolved lib object
      const lib = (pdfjsLib as any).default || pdfjsLib;
      const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `\n--- [PDF Page ${i}] ---\n${pageText}`;
      }
      return fullText;
    } catch (e) {
      console.error("PDF Parsing Error:", e);
      return `[解析 PDF ${file.name} 失败: 请确保文件未损坏]`;
    }
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (e) {
      console.error("DOCX Parsing Error:", e);
      return `[解析 Word ${file.name} 失败]`;
    }
  };

  // --- Handlers ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    setLoadingMessage('正在解析文件内容...');

    let combinedText = '';
    let processedCount = 0;
    
    // Loop through all selected files
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let fileText = '';

        if (file.type === 'text/plain' || file.name.endsWith('.md')) {
            fileText = await file.text();
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            fileText = await extractTextFromPdf(file);
        } else if (
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
            file.name.endsWith('.docx')
        ) {
            fileText = await extractTextFromDocx(file);
        } else {
            console.warn(`Unsupported file type: ${file.type}`);
            continue;
        }

        if (fileText) {
            combinedText += `\n\n=== 来源文档: ${file.name} ===\n\n${fileText}`;
            processedCount++;
        }
    }

    setIsLoading(false);

    if (processedCount > 0) {
        setInputText(prev => {
            const separator = prev ? '\n\n' : '';
            return prev + separator + combinedText;
        });
        if(processedCount < files.length) {
            alert(`已导入 ${processedCount} 个文件。部分不支持的格式已被跳过。`);
        }
    } else {
      alert("请上传 .txt, .md, .pdf 或 .docx 格式的文件。");
    }
  };

  const handleGenerateOutline = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setLoadingMessage(`Gemini 3 Pro 正在以“${pptPurpose}”视角分析文档，构建${textDensity === 'detailed' ? '详细' : '精简'}大纲...`);
    
    try {
      const generatedSlides = await GeminiService.generateOutline(inputText, slideCount, pptPurpose, textDensity, customInstruction);
      setSlides(generatedSlides);
      setStage(AppStage.Outline);
    } catch (error) {
      console.error(error);
      alert("生成大纲失败 (500 Error)。请检查内容长度或稍后重试。");
    } finally {
      setIsLoading(false);
    }
  };

  // Outline Editing Handlers
  const handleOutlineChange = (index: number, field: keyof SlideData, value: any) => {
    const newSlides = [...slides];
    newSlides[index] = { ...newSlides[index], [field]: value };
    setSlides(newSlides);
  };

  const handleAddSlide = (index: number) => {
    const newSlide: SlideData = {
      id: `slide-new-${Date.now()}`,
      type: SlideType.Content,
      layout: SlideLayout.TextOnly,
      title: "新页面",
      contentPoints: ["点击编辑要点", "点击编辑要点"],
      speakerNotes: "新页面备注",
      imagePrompt: "Abstract background"
    };
    const newSlides = [...slides];
    newSlides.splice(index + 1, 0, newSlide);
    setSlides(newSlides);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) {
      alert("至少保留一页");
      return;
    }
    const newSlides = slides.filter((_, i) => i !== index);
    setSlides(newSlides);
  };

  const handleConfirmOutline = async () => {
    setStage(AppStage.Editor);
    setIsAutoFit(true); // Enable auto-fit when entering editor
    
    // Remove auto-batch generation.
    // Automatically generate ONLY the first slide's image to give user a starting point.
    if (slides.length > 0) {
       handleGenerateImage(slides[0].id, slides[0].imagePrompt);
    }
  };

  // Auto regenerate prompt based on current content
  const handleAutoOptimizePrompt = async () => {
      const activeSlide = slides[activeSlideIndex];
      setIsPromptRegenerating(true);
      try {
          const newPrompt = await GeminiService.generateImagePromptFromContent(activeSlide);
          setLocalImagePrompt(newPrompt);
          // Sync with main state
          setSlides(prev => prev.map(s => s.id === activeSlide.id ? { ...s, imagePrompt: newPrompt } : s));
      } catch (e) {
          console.error(e);
      } finally {
          setIsPromptRegenerating(false);
      }
  };

  // Added isBatch flag to suppress alerts during batch processing
  const handleGenerateImage = async (slideId: string, customPrompt: string, isBatch: boolean = false) => {
    
    // Critical Fix: Use functional state update to prevent closure staleness during batch operations
    setSlides(prevSlides => prevSlides.map(s => 
      s.id === slideId ? { ...s, isGeneratingImage: true, imagePrompt: customPrompt } : s
    ));

    const slideToGen = slides.find(s => s.id === slideId);
    // Note: We use the local variable slideToGen for immediate properties, but the ID for async updates
    
    // Merge local prompt if it differs (for manual click)
    // IMPORTANT: If called from batch, customPrompt is passed in.
    // If called manually, customPrompt is also passed in.
    const currentSlideData = slideToGen ? { ...slideToGen, imagePrompt: customPrompt } : null;

    if (!currentSlideData) return;

    try {
      // UPGRADE: Use the new Full Context Image Generation
      const url = await GeminiService.generateSlideImage(currentSlideData, currentTheme, customInstruction);
      
      setSlides(prevSlides => prevSlides.map(s => 
        s.id === slideId ? { ...s, imageUrl: url, isGeneratingImage: false, layout: SlideLayout.AiBackground } : s
      ));
    } catch (e: any) {
      console.error(e);
      // Only alert if it's a manual action
      if (!isLoading && !isBatch) {
          alert(`配图生成失败: ${e.message || "模型未返回图片数据"}\n\n建议尝试修改提示词或稍后重试。`);
      }
      setSlides(prevSlides => prevSlides.map(s => 
        s.id === slideId ? { ...s, isGeneratingImage: false } : s
      ));
    }
  };

  const handleBatchGenerateImages = async () => {
      console.log("Batch generation started");
      
      // Filter slides that need images
      // NOTE: We rely on the current state 'slides'.
      const slidesToGen = slides.filter(s => !s.imageUrl && !s.isGeneratingImage);
      
      if (slidesToGen.length === 0) {
          alert("所有页面均已包含配图。");
          return;
      }

      // Removed confirm dialog to fix "unresponsive" feel if dialog is blocked
      setIsBatchGenerating(true);
      setBatchProgress(0);
      const total = slidesToGen.length;
      
      try {
          // Process sequentially to avoid rate limits
          for (let i = 0; i < total; i++) {
             const slide = slidesToGen[i];
             setBatchProgress(i + 1); // Update progress
             
             // Pass true for isBatch to suppress individual alerts
             await handleGenerateImage(slide.id, slide.imagePrompt, true);
             
             // 1.5s delay to be nice to the API
             if (i < total - 1) {
                 await new Promise(r => setTimeout(r, 1500));
             }
          }
      } catch (e) {
          console.error("Batch error", e);
      } finally {
          setIsBatchGenerating(false);
          setBatchProgress(0);
      }
  };

  // --- NEW: Knowledge Graph Handler ---
  const handleGenerateKnowledgeGraph = async () => {
      const activeSlide = slides[activeSlideIndex];
      // Mark as generating
      setSlides(prev => prev.map(s => s.id === activeSlide.id ? { ...s, isGeneratingImage: true } : s));
      
      try {
          // Generate the chart
          const url = await GeminiService.generateKnowledgeGraph(activeSlide, currentTheme);
          
          setSlides(prev => prev.map(s => {
             if(s.id === activeSlide.id) {
                 return {
                     ...s,
                     imageUrl: url,
                     isGeneratingImage: false,
                     layout: SlideLayout.Center // Switch to Center layout to showcase the graph
                 };
             }
             return s;
          }));
          
      } catch (e: any) {
          console.error(e);
          alert("知识图谱生成失败，请稍后重试。");
          setSlides(prev => prev.map(s => s.id === activeSlide.id ? { ...s, isGeneratingImage: false } : s));
      }
  };

  const handleRefineContent = async () => {
    if (!editInstruction) return;
    const activeSlide = slides[activeSlideIndex];
    setIsLoading(true);
    setLoadingMessage('Gemini 3 Pro 正在根据您的指令重写本页内容...');
    try {
      const refined = await GeminiService.refineSlideContent(activeSlide, editInstruction);
      setSlides(prev => prev.map(s => 
        s.id === activeSlide.id ? { ...s, ...refined } : s
      ));
      setEditInstruction('');
    } catch (e) {
      alert("重写失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveImagePrompt = () => {
      // Update local state first
      const activeSlideId = slides[activeSlideIndex].id;
      
      setSlides(prev => prev.map(s => 
          s.id === activeSlideId ? { ...s, imagePrompt: localImagePrompt } : s
      ));
      
      // Trigger generation with the NEW prompt specifically
      handleGenerateImage(activeSlideId, localImagePrompt);
  };
  
  // --- Zoom Handlers ---
  const handleZoomIn = () => {
    setIsAutoFit(false);
    setPreviewScale(s => Math.min(3, s + 0.1));
  };

  const handleZoomOut = () => {
    setIsAutoFit(false);
    setPreviewScale(s => Math.max(0.2, s - 0.1));
  };

  const handleResetZoom = () => {
    setIsAutoFit(true);
  };

  // --- Export Handlers ---
  const handleExportOutline = () => {
    if (slides.length === 0) return;

    let outlineText = `PPT 大纲 - ${pptPurpose}\n生成日期: ${new Date().toLocaleDateString()}\n--------------------------------\n\n`;

    slides.forEach((slide, index) => {
        outlineText += `P${index + 1} [${slide.type.toUpperCase()}]\n`;
        outlineText += `标题: ${slide.title}\n`;
        if (slide.subTitle) outlineText += `副标题: ${slide.subTitle}\n`;
        outlineText += `要点:\n${slide.contentPoints.map(p => `  - ${p}`).join('\n')}\n`;
        if (slide.speakerNotes) outlineText += `备注: ${slide.speakerNotes}\n`;
        outlineText += `配图指令: ${slide.imagePrompt}\n\n`;
        outlineText += `--------------------------------\n\n`;
    });

    const blob = new Blob([outlineText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PPT大纲-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPPTX = async () => {
    setIsLoading(true);
    setLoadingMessage('正在生成 PPTX 文件...');

    try {
      // Initialize PptxGenJS
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9'; // 16:9 aspect ratio
      pptx.author = 'AI PPT Workbench';
      pptx.company = 'Gemini AI';
      pptx.subject = pptPurpose;
      pptx.title = slides[0]?.title || 'Presentation';

      // Map Slides
      slides.forEach(slideData => {
         const slide = pptx.addSlide();
         
         // Color extraction
         const textColor = currentTheme.colors.text.replace('#', '');
         const primaryColor = currentTheme.colors.primary.replace('#', '');
         const accentColor = currentTheme.colors.accent.replace('#', '');
         const textLightColor = currentTheme.colors.textLight.replace('#', '');
         const bgColor = currentTheme.colors.background.replace('#', '');

         // 1. Background Logic
         if (slideData.layout === SlideLayout.AiBackground && slideData.imageUrl) {
             // OCR Simulation: The image is set as a background layer
             slide.background = { data: slideData.imageUrl };
         } else {
             // Standard background color
             slide.background = { color: bgColor };
         }

         // 2. Add Speaker Notes
         if (slideData.speakerNotes) {
             slide.addNotes(slideData.speakerNotes);
         }

         // 3. Render Content (Editable Text Boxes)
         if (slideData.type === SlideType.Cover) {
             // Title Box
             slide.addText(slideData.title, {
                 x: 0.5, y: '40%', w: '90%', h: 1.5,
                 fontSize: 44,
                 bold: true,
                 align: 'center',
                 color: primaryColor,
                 fontFace: 'Arial'
             });
             // Subtitle Box
             if (slideData.subTitle) {
                slide.addText(slideData.subTitle, {
                    x: 1, y: '55%', w: '80%', h: 1,
                    fontSize: 24,
                    align: 'center',
                    color: textLightColor,
                    fontFace: 'Arial'
                });
             }
             // Decorative shapes (only for non-image background)
             if (slideData.layout !== SlideLayout.AiBackground) {
                slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:'100%', h:0.2, fill: { color: primaryColor } });
             }

         } else if (slideData.type === SlideType.Section) {
             // Section Break
             if (slideData.layout !== SlideLayout.AiBackground) {
                 slide.background = { color: primaryColor };
                 slide.addText(slideData.title, {
                    x: 1, y: '40%', w: '80%', h: 2,
                    fontSize: 36, bold: true, align: 'center', color: 'FFFFFF'
                 });
             } else {
                 // On image background, use white text with shadow for readability
                 slide.addText(slideData.title, {
                    x: 1, y: '40%', w: '80%', h: 2,
                    fontSize: 36, bold: true, align: 'center', color: 'FFFFFF',
                    shadow: { type: 'outer', blur: 10, color: '000000', opacity: 0.5 }
                 });
             }
             
             if (slideData.contentPoints.length > 0) {
                 slide.addText(slideData.contentPoints[0], {
                     x: 1, y: '60%', w: '80%', h: 1,
                     fontSize: 18, italic: true, align: 'center', color: 'DDDDDD'
                 });
             }

         } else if (slideData.type === SlideType.End) {
             // End Slide
             if (slideData.layout !== SlideLayout.AiBackground) {
                slide.background = { color: primaryColor };
             }
             slide.addText(slideData.title || "感谢观看", {
                 x: 0, y: '45%', w: '100%', h: 1,
                 fontSize: 40,
                 bold: true,
                 align: 'center',
                 color: 'FFFFFF',
                 shadow: { type: 'outer', blur: 5, color: '000000', opacity: 0.3 }
             });

         } else {
             // === CONTENT SLIDES ===
             // Simulate OCR/WPS conversion:
             // 1. Image is at the back (set via slide.background above)
             // 2. Text is added here as EDITABLE text boxes on top.

             const isAiBg = slideData.layout === SlideLayout.AiBackground && !!slideData.imageUrl;

             if (isAiBg) {
                // For AI Backgrounds, we add a subtle semi-transparent white container 
                // to mimic the "Glassmorphism" look in the preview, but kept editable.
                
                // Container Box (Editable Shape)
                slide.addShape(pptx.ShapeType.rect, { 
                    x: 0.5, y: 0.5, w: 9, h: 4.5, 
                    fill: { color:'FFFFFF', transparency: 15 }, // 15% opacity white
                    line: { color: 'FFFFFF', transparency: 50, width: 1 } // subtle border
                }); 
                
                // Title Text (Editable)
                slide.addText(slideData.title, {
                    x: 1, y: 1, w: 8, h: 0.8,
                    fontSize: 28, bold: true, color: primaryColor, fontFace: 'Arial'
                });
                
                // Content Points (Editable Bullets)
                // Adaptive font size logic based on content length
                const totalTextLength = slideData.contentPoints.join('').length;
                const dynamicFontSize = totalTextLength > 150 ? 14 : totalTextLength > 100 ? 16 : 18;

                const bullets = slideData.contentPoints.map(p => ({ text: p, options: { breakLine: true } }));
                slide.addText(bullets, {
                    x: 1, y: 1.8, w: 8, h: 3.0,
                    fontSize: dynamicFontSize, 
                    color: textColor, 
                    bullet: { type: 'bullet', code: '2022' }, 
                    paraSpaceBefore: 10, 
                    lineSpacing: 28, 
                    fontFace: 'Arial',
                    valign: 'top'
                });

             } else {
                 // Standard Layouts (Image Left/Right/Center)
                 // This logic remains mostly the same, standard PPT generation
                 
                 // Title
                 slide.addText(slideData.title, {
                     x: 0.5, y: 0.3, w: '90%', h: 0.6,
                     fontSize: 28, bold: true, color: primaryColor, fontFace: 'Arial'
                 });
                 slide.addShape(pptx.ShapeType.line, { x:0.5, y:0.95, w:'90%', h:0, line: { color: textLightColor, width: 1 } });

                 let textX = 0.5;
                 let textW = 9.0;
                 
                 // Image placement for Standard Layouts
                 if (slideData.imageUrl) {
                     if (slideData.layout === SlideLayout.ImageRight) {
                         textW = 4.5;
                         slide.addImage({ data: slideData.imageUrl, x: 5.2, y: 1.2, w: 4.5, h: 4.0, sizing: { type: 'cover', w: 4.5, h: 4.0 } });
                     } else if (slideData.layout === SlideLayout.ImageLeft) {
                         textX = 5.0;
                         textW = 4.5;
                         slide.addImage({ data: slideData.imageUrl, x: 0.5, y: 1.2, w: 4.0, h: 4.0, sizing: { type: 'cover', w: 4.0, h: 4.0 } });
                     } else if (slideData.layout === SlideLayout.Center) {
                        textW = 9.0;
                        slide.addImage({ data: slideData.imageUrl, x: 2.5, y: 1.2, w: 5.0, h: 2.8, sizing: { type: 'contain', w: 5.0, h: 2.8 } });
                     }
                 }

                 let textY = (!!slideData.imageUrl && slideData.layout === SlideLayout.Center) ? 4.2 : 1.2;
                 const bullets = slideData.contentPoints.map(p => ({ text: p, options: { breakLine: true } }));
                 
                 slide.addText(bullets, {
                     x: textX, y: textY, w: textW, h: 4.0,
                     fontSize: 16,
                     color: textColor,
                     bullet: true,
                     paraSpaceBefore: 12,
                     lineSpacing: 28,
                     valign: 'top',
                     fontFace: 'Arial'
                 });
             }
         }

         // Footer
         slide.addText('CONFIDENTIAL - Generated by AI PPT', {
             x: 0.5, y: 5.2, w: '90%', h: 0.3,
             fontSize: 9, color: 'AAAAAA'
         });
         slide.addText(`${slides.indexOf(slideData) + 1}`, {
             x: 9.0, y: 5.2, w: 0.5, h: 0.3,
             fontSize: 9, color: 'AAAAAA', align: 'right'
         });
      });

      await pptx.writeFile({ fileName: `AI-Presentation-${new Date().toISOString().slice(0,10)}.pptx` });

    } catch (e) {
      console.error(e);
      alert("PPTX 生成失败，请查看控制台日志。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setStage(AppStage.Export);
    // Give time for the DOM to render the export view
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!exportContainerRef.current) {
      console.error("Export container not found");
      setStage(AppStage.Editor); 
      return;
    }

    setIsLoading(true);

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [960, 540]
      });

      const nodes = exportContainerRef.current.querySelectorAll('.slide-export-node');
      
      for (let i = 0; i < nodes.length; i++) {
        setLoadingMessage(`正在导出 PDF: 第 ${i + 1} / ${nodes.length} 页...`);
        const node = nodes[i] as HTMLElement;
        const canvas = await html2canvas(node, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        
        if (i > 0) pdf.addPage([960, 540]);
        pdf.addImage(imgData, 'JPEG', 0, 0, 960, 540);
      }

      pdf.save(`AI-PPT-${new Date().toISOString().slice(0, 10)}.pdf`);

    } catch (e) {
      console.error(e);
      alert("PDF 生成失败，请重试。");
    } finally {
      setIsLoading(false);
      setStage(AppStage.Editor);
    }
  };

  // --- Render Sub-Components ---

  const renderStepper = () => {
      const steps = [
          { id: AppStage.Input, label: '1. 内容输入', icon: FileText },
          { id: AppStage.Outline, label: '2. 大纲规划', icon: AlignJustify },
          { id: AppStage.Editor, label: '3. 视觉设计', icon: Palette }
      ];

      return (
          <div className="max-w-4xl mx-auto mb-8 mt-6">
              <div className="flex items-center justify-between relative px-10">
                  <div className="absolute left-10 right-10 top-1/2 transform -translate-y-1/2 h-1 bg-gray-200 -z-10 rounded-full"></div>
                  {steps.map((step, idx) => {
                      const isActive = stage === step.id;
                      const isCompleted = (stage === AppStage.Outline && idx === 0) || (stage === AppStage.Editor && idx <= 1) || (stage === AppStage.Export);
                      const canNav = step.id === AppStage.Input || (slides.length > 0);
                      
                      return (
                          <button 
                             key={step.id}
                             onClick={() => canNav && setStage(step.id)}
                             disabled={!canNav}
                             className={`flex flex-col items-center gap-2 px-4 py-2 rounded-xl transition-all bg-white/80 backdrop-blur-sm
                                 ${isActive ? 'scale-110' : ''}
                                 ${canNav ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-60'}
                             `}
                          >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shadow-sm transition-colors z-10
                                  ${isActive ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200' : 
                                    isCompleted ? 'bg-green-500 border-green-500 text-white' : 
                                    'bg-white border-gray-300 text-gray-400'}
                              `}>
                                  {isCompleted && !isActive ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                              </div>
                              <span className={`text-xs font-bold px-2 rounded ${isActive ? 'text-blue-700' : 'text-gray-500'}`}>
                                  {step.label}
                              </span>
                          </button>
                      )
                  })}
              </div>
          </div>
      )
  };

  const renderSettingsModal = () => {
    if (!isSettingsOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-gray-50 p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-gray-500" />
                        应用设置
                    </h3>
                    <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-700 block">Google Gemini API Key</label>
                        <div className="flex gap-2">
                            <input 
                                type="password" 
                                value={settingsKey}
                                onChange={(e) => {
                                    setSettingsKey(e.target.value);
                                    setKeyTestStatus('idle');
                                }}
                                className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                                placeholder="AIza..."
                            />
                            <button 
                                onClick={handleTestSettingsKey}
                                disabled={!settingsKey || keyTestStatus === 'testing'}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                                {keyTestStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                测试
                            </button>
                        </div>
                        {keyTestStatus === 'success' && (
                            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded border border-green-100">
                                <CheckCircle2 className="w-3 h-3" /> 
                                <span>连接成功，API Key 有效</span>
                            </div>
                        )}
                        {keyTestStatus === 'error' && (
                            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                                <XCircle className="w-3 h-3" /> 
                                <span>连接失败，请检查网络或 Key 是否正确</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-bold transition-colors">取消</button>
                    <button onClick={handleSaveSettings} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-95">保存更改</button>
                </div>
            </div>
        </div>
    );
  };

  // --- Renders ---
  const renderInputStage = () => (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-2xl shadow-sm border border-gray-100 mb-10">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-gray-800 mb-3">AI 商务 PPT 制作工作台</h2>
        <p className="text-gray-500 max-w-lg mx-auto">
            上传 Markdown、Word 或 PDF 文档，Gemini 3 Pro 将为您提炼重点，拆分章节，并生成专业级演示文稿。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">直接输入文本 (支持 Markdown)</label>
          <textarea
            className="w-full h-80 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-gray-50 text-sm leading-relaxed"
            placeholder="在此粘贴文档内容..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          ></textarea>
        </div>
        
        <div className="space-y-6">
          {/* File Upload Area */}
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-2">或上传文档 (支持多文件)</label>
             <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 hover:border-blue-400 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-4 pb-4">
                        <Files className="w-6 h-6 text-gray-400 group-hover:text-blue-500 mb-1 transition-colors" />
                        <p className="text-xs text-gray-500 group-hover:text-gray-700">点击上传 PDF, Word, TXT, MD</p>
                    </div>
                    <input 
                        type="file" 
                        className="hidden" 
                        accept=".txt,.md,.pdf,.docx" 
                        multiple
                        onChange={handleFileUpload} 
                    />
                </label>
             </div>
          </div>

          <hr className="border-gray-100" />

          {/* Preferences Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-800">生成偏好设置</h3>
            
            {/* Purpose Selector */}
            <div className="grid grid-cols-3 gap-2">
                {[
                    { id: '工作汇报', icon: Briefcase, label: '工作汇报' },
                    { id: '教学课件', icon: GraduationCap, label: '教学课件' },
                    { id: '产品演示', icon: Presentation, label: '产品演示' }
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setPptPurpose(item.id)}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${pptPurpose === item.id ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        <item.icon className="w-5 h-5 mb-1" />
                        <span className="text-xs font-medium">{item.label}</span>
                    </button>
                ))}
            </div>

            {/* Density Selector */}
            <div className="flex gap-2">
                <button
                    onClick={() => setTextDensity('standard')}
                    className={`flex-1 flex items-center justify-center p-3 rounded-lg border transition-all ${textDensity === 'standard' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    <AlignLeft className="w-4 h-4 mr-2" />
                    <div className="text-left">
                        <span className="block text-xs font-bold">精简模式</span>
                        <span className="block text-[10px] opacity-70">适合演讲，要点清晰</span>
                    </div>
                </button>
                <button
                    onClick={() => setTextDensity('detailed')}
                    className={`flex-1 flex items-center justify-center p-3 rounded-lg border transition-all ${textDensity === 'detailed' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    <AlignJustify className="w-4 h-4 mr-2" />
                    <div className="text-left">
                        <span className="block text-xs font-bold">详细模式</span>
                        <span className="block text-[10px] opacity-70">适合阅读，内容详实</span>
                    </div>
                </button>
            </div>

            {/* Slide Count */}
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 flex justify-between">
                    <span>目标页数</span>
                    <span className="text-blue-600 font-bold">{slideCount} 页</span>
                </label>
                <input 
                    type="range" 
                    min="1" 
                    max="70" 
                    value={slideCount} 
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>
            
            {/* New: Custom Instructions */}
            <div className="pt-2">
                <label className="block text-xs font-medium text-gray-700 mb-2 flex items-center">
                    <MessageSquare className="w-3 h-3 mr-1" />
                    <span>额外指令 / 特殊要求 (选填)</span>
                </label>
                <textarea 
                    className="w-full text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none h-20 shadow-sm leading-relaxed"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="例如：请多引用历史案例；第三章需要详细展开；风格要幽默风趣..."
                />
            </div>

          </div>
        </div>
      </div>

      <button 
        onClick={handleGenerateOutline}
        disabled={!inputText.trim()}
        className={`w-full py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center space-x-2 transition-all shadow-lg hover:shadow-xl
          ${!inputText.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800'}`}
      >
        <Wand2 className="w-5 h-5" />
        <span>开始智能制作 (Next)</span>
      </button>
    </div>
  );

  const renderOutlineStage = () => (
    <div className="max-w-5xl mx-auto mt-4 px-4 pb-12">
       <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">编辑大纲</h2>
            <p className="text-sm text-gray-500">点击下方文本框即可直接修改内容，调整每一页的结构。</p>
          </div>
          <div className="space-x-3 flex items-center">
             {/* Nav Buttons */}
             <button onClick={() => setStage(AppStage.Input)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 flex items-center gap-2">
                 <ArrowLeft className="w-4 h-4" /> 上一步
             </button>

             <button onClick={handleExportOutline} className="px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 flex items-center space-x-1 text-sm font-medium">
                 <FileText className="w-4 h-4" />
                 <span>下载大纲</span>
             </button>
             
             <button onClick={handleConfirmOutline} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md flex items-center gap-2">
                 确认并生成 (Next) <ChevronRight className="w-4 h-4" />
             </button>
          </div>
       </div>

       <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6 bg-gray-50">
             {slides.map((slide, idx) => (
                <div key={slide.id} className="relative p-5 border border-gray-200 rounded-xl bg-white hover:border-blue-300 transition-colors group">
                   <div className="flex items-start gap-4">
                        {/* Index & Drag Handle Visual */}
                        <div className="flex flex-col items-center gap-2 mt-2">
                             <div className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center font-bold font-mono text-sm">
                                {idx + 1}
                             </div>
                             <div className="p-1 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                                 <GripVertical className="w-4 h-4" />
                             </div>
                        </div>

                        {/* Editable Content */}
                        <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                                <select 
                                    className="text-xs font-bold uppercase px-2 py-1 rounded border bg-gray-50 border-gray-200 text-gray-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={slide.type}
                                    onChange={(e) => handleOutlineChange(idx, 'type', e.target.value)}
                                >
                                    <option value={SlideType.Cover}>封面</option>
                                    <option value={SlideType.Section}>过渡页</option>
                                    <option value={SlideType.Content}>内容页</option>
                                    <option value={SlideType.End}>结束页</option>
                                </select>
                                {/* Adjusted Title Input: Less strenuous, clear and standard look */}
                                <input 
                                    className="flex-1 font-bold text-lg text-gray-800 bg-white border border-gray-200 hover:border-blue-300 focus:border-blue-500 rounded-lg px-3 py-2 outline-none transition-all"
                                    value={slide.title}
                                    onChange={(e) => handleOutlineChange(idx, 'title', e.target.value)}
                                    placeholder="输入页面标题"
                                />
                                <button 
                                    onClick={() => handleDeleteSlide(idx)}
                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                    title="删除此页"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="pl-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">内容要点 (每行一点):</label>
                                <textarea 
                                    className="w-full text-sm text-gray-600 bg-gray-50 border border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white rounded p-2 outline-none resize-none overflow-hidden"
                                    rows={slide.contentPoints.length || 2}
                                    value={slide.contentPoints.join('\n')}
                                    onChange={(e) => handleOutlineChange(idx, 'contentPoints', e.target.value.split('\n'))}
                                    style={{ minHeight: '60px' }}
                                />
                            </div>

                            <div className="flex items-start gap-2 bg-blue-50/30 p-2 rounded border border-blue-100/50">
                                <ImageIcon className="w-3 h-3 text-blue-400 mt-1 shrink-0" />
                                <input 
                                    className="flex-1 text-xs text-blue-600 bg-transparent border-none focus:ring-0 placeholder-blue-300"
                                    value={slide.imagePrompt}
                                    onChange={(e) => handleOutlineChange(idx, 'imagePrompt', e.target.value)}
                                    placeholder="AI 配图提示词 (英文)..."
                                />
                            </div>
                        </div>
                   </div>

                   {/* Add Slide Button Below */}
                   <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                       <button 
                         onClick={() => handleAddSlide(idx)}
                         className="flex items-center gap-1 bg-blue-600 text-white text-xs px-3 py-1 rounded-full shadow-lg hover:scale-105 transition-transform"
                       >
                           <Plus className="w-3 h-3" /> 加一页
                       </button>
                   </div>
                </div>
             ))}
             
             {/* Bottom Add Button */}
             <div className="text-center pt-2">
                 <button 
                    onClick={() => handleAddSlide(slides.length - 1)}
                    className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 hover:border-blue-500 px-6 py-3 rounded-xl transition-all w-full justify-center"
                 >
                     <Plus className="w-5 h-5" />
                     <span>添加新页面</span>
                 </button>
             </div>
          </div>
       </div>
    </div>
  );

  const renderEditorStage = () => {
    const activeSlide = slides[activeSlideIndex];
    if (!activeSlide) return null;

    // Check availability of batch generation
    const canBatch = !isBatchGenerating && slides.some(s => !s.imageUrl && !s.isGeneratingImage);
    const completedCount = slides.filter(s => !!s.imageUrl).length;
    const totalCount = slides.length;

    // --- Dynamic Scale for Thumbnails ---
    // Calculate scale to fit 960px into the available sidebar width.
    // Sidebar padding (p-3) = 24px total horizontal padding on container
    // Item padding (p-3) = 24px total horizontal padding on item
    // Borders = 4px approx
    // Scrollbar = 10px approx
    // Total reduction ~ 62px. Using 64px for safety.
    const safeThumbnailWidth = Math.max(100, leftWidth - 64);
    const thumbnailScale = safeThumbnailWidth / 960;

    return (
      <div className="flex h-[calc(100vh-140px)] mt-4 px-6 pb-6 overflow-hidden w-full mx-auto relative">
        
        {/* Left Sidebar: Thumbnails */}
        {showLeftSidebar && (
            <div 
                className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full flex-shrink-0 relative overflow-hidden"
                style={{ width: `${leftWidth}px` }}
            >
                <div className="p-4 border-b border-gray-100 font-bold text-gray-700 flex justify-between items-center flex-shrink-0">
                    <span>幻灯片</span>
                    <button 
                        onClick={() => setShowLeftSidebar(false)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                        title="收起侧边栏"
                    >
                        <PanelLeftClose className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                    <button 
                        onClick={() => setStage(AppStage.Outline)}
                        className="w-full text-xs text-gray-500 hover:text-blue-600 flex items-center justify-center gap-1 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors mb-3"
                    >
                        <ArrowLeft className="w-3 h-3" /> 返回大纲
                    </button>
                    {slides.map((slide, idx) => (
                        <div 
                        key={slide.id}
                        onClick={() => setActiveSlideIndex(idx)}
                        className={`p-3 rounded-xl cursor-pointer transition-all border-2 group
                            ${activeSlideIndex === idx ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100 ring-offset-1' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'}`}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className={`text-xs font-bold ${activeSlideIndex === idx ? 'text-blue-700' : 'text-gray-500'}`}>第 {idx + 1} 页</span>
                                <span className="text-[10px] text-gray-400 uppercase">{slide.type}</span>
                            </div>
                            <div className="w-full aspect-video bg-gray-100 rounded border border-gray-200 overflow-hidden relative shadow-sm group-hover:shadow-md transition-shadow">
                                <div 
                                    className="origin-top-left pointer-events-none select-none bg-white"
                                    style={{ 
                                        width: '960px', 
                                        height: '540px', 
                                        transform: `scale(${thumbnailScale})`,
                                    }}
                                >
                                    <SlideRenderer slide={slide} theme={currentTheme} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Left Resizer */}
        {showLeftSidebar && (
            <div 
                className="w-4 cursor-col-resize flex items-center justify-center -ml-2 z-20 hover:bg-blue-500/10 group transition-colors"
                onMouseDown={handleMouseDownLeft}
            >
                <div className="w-1 h-8 bg-gray-300 rounded-full group-hover:bg-blue-400 transition-colors" />
            </div>
        )}

        {/* Left Expand Button (When hidden) */}
        {!showLeftSidebar && (
            <button
                onClick={() => setShowLeftSidebar(true)}
                className="absolute left-6 top-6 z-30 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-500 hover:text-blue-600"
                title="展开幻灯片列表"
            >
                <PanelLeftOpen className="w-5 h-5" />
            </button>
        )}

        {/* Center: Main Preview */}
        <div className="flex-1 flex flex-col bg-gray-100 rounded-2xl overflow-hidden relative border border-gray-200 min-w-0">
           {/* Canvas Container with Scroll */}
           <div 
              ref={previewContainerRef}
              className={`flex-1 flex items-center justify-center p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] relative
                  ${isAutoFit ? 'overflow-hidden' : 'overflow-auto'}`}
           >
              <div 
                  className="shadow-2xl ring-1 ring-black/5 transition-transform duration-300 origin-center"
                  style={{ transform: `scale(${previewScale})` }}
              >
                 <SlideRenderer slide={activeSlide} theme={currentTheme} scale={1} />
              </div>

              {/* Zoom Controls */}
              <div className="absolute bottom-6 right-6 flex items-center space-x-2 bg-white/90 backdrop-blur shadow-md rounded-lg p-2 border border-gray-200 z-20">
                  <button onClick={handleZoomOut} className="p-1 hover:bg-gray-100 rounded text-gray-600" title="缩小">
                      <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono w-12 text-center text-gray-700">{Math.round(previewScale * 100)}%</span>
                  <button onClick={handleZoomIn} className="p-1 hover:bg-gray-100 rounded text-gray-600" title="放大">
                      <ZoomIn className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-gray-300 mx-1"></div>
                  <button 
                      onClick={handleResetZoom} 
                      className={`p-1 rounded text-gray-600 ${isAutoFit ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100'}`} 
                      title="自适应屏幕"
                  >
                      <Monitor className="w-4 h-4" />
                  </button>
              </div>
           </div>
           
           {/* Navigation Controls */}
           <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur-md px-8 py-3 rounded-2xl shadow-xl flex items-center space-x-8 border border-gray-100 z-10">
              <button 
                onClick={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))}
                disabled={activeSlideIndex === 0}
                className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"
                title="上一页"
              >
                <ChevronLeft className="w-6 h-6 text-gray-700" />
              </button>
              <div className="flex flex-col items-center">
                  <span className="font-bold text-gray-800 text-lg">
                    {activeSlideIndex + 1} <span className="text-gray-400 font-light mx-1">/</span> {slides.length}
                  </span>
                  <span className="text-xs text-gray-500">{activeSlide.type === 'cover' ? '封面页' : activeSlide.type === 'section' ? '章节页' : '内容页'}</span>
              </div>
              <button 
                onClick={() => setActiveSlideIndex(Math.min(slides.length - 1, activeSlideIndex + 1))}
                disabled={activeSlideIndex === slides.length - 1}
                className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"
                title="下一页"
              >
                <ChevronRight className="w-6 h-6 text-gray-700" />
              </button>
           </div>
        </div>

        {/* Right Resizer */}
        {showRightSidebar && (
            <div 
                className="w-4 cursor-col-resize flex items-center justify-center -mr-2 z-20 hover:bg-blue-500/10 group transition-colors"
                onMouseDown={handleMouseDownRight}
            >
                <div className="w-1 h-8 bg-gray-300 rounded-full group-hover:bg-blue-400 transition-colors" />
            </div>
        )}

        {/* Right Expand Button (When hidden) */}
        {!showRightSidebar && (
            <button
                onClick={() => setShowRightSidebar(true)}
                className="absolute right-6 top-6 z-30 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-500 hover:text-blue-600"
                title="展开视觉工作室"
            >
                <PanelRightOpen className="w-5 h-5" />
            </button>
        )}

        {/* Right Sidebar: Visual Studio */}
        {showRightSidebar && (
            <div 
                className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden flex-shrink-0"
                style={{ width: `${rightWidth}px` }}
            >
                <div className="p-4 border-b border-gray-100 flex-shrink-0 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">视觉工作室</h3>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Visual Studio</p>
                    </div>
                    <button 
                        onClick={() => setShowRightSidebar(false)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                        title="收起侧边栏"
                    >
                        <PanelRightClose className="w-4 h-4" />
                    </button>
                </div>
           
                {/* Allow this middle section to scroll independently */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6 min-h-0">
                    
                    {/* BATCH GENERATE BUTTON */}
                    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm text-blue-600">
                                <Wand2 className="w-5 h-5" />
                            </div>
                            <div className="flex-1 w-full">
                                <h4 className="text-sm font-bold text-gray-800 mb-1">一键全套生成</h4>
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs text-gray-500">自动补全所有缺省配图</p>
                                    <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-100 px-1.5 rounded">{completedCount}/{totalCount}</span>
                                </div>
                                
                                {/* Progress Bar if generating */}
                                {isBatchGenerating && (
                                    <div className="w-full h-1.5 bg-gray-200 rounded-full mb-3 overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(batchProgress / (slides.length - completedCount + batchProgress || 1)) * 100}%` }}></div>
                                    </div>
                                )}

                                <button 
                                    onClick={handleBatchGenerateImages}
                                    disabled={!canBatch}
                                    className={`w-full py-2.5 text-xs font-bold rounded-lg shadow transition-colors flex items-center justify-center gap-2
                                        ${canBatch 
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer' 
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
                                >
                                    {isBatchGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                    {isBatchGenerating ? `正在生成 (${batchProgress}...)` : '开始批量渲染'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Window 1: Content Reference (Editable) */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col shadow-sm">
                        <div className="flex items-center gap-2 mb-3 text-gray-500 flex-shrink-0 justify-between">
                            <div className="flex items-center gap-2">
                                <Edit3 className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wide">窗口一：内容编辑</span>
                            </div>
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">实时修改</span>
                        </div>
                        {/* Auto-growing content area */}
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">标题</label>
                                <input 
                                    className="w-full text-sm font-bold text-gray-800 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                                    value={activeSlide.title}
                                    onChange={(e) => {
                                        const newSlides = [...slides];
                                        newSlides[activeSlideIndex] = { ...activeSlide, title: e.target.value };
                                        setSlides(newSlides);
                                    }}
                                    placeholder="输入页面标题"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">内容要点 (每行一点)</label>
                                <textarea 
                                    className="w-full text-xs text-gray-600 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y min-h-[140px] leading-relaxed transition-shadow"
                                    value={activeSlide.contentPoints.join('\n')}
                                    onChange={(e) => {
                                        const newSlides = [...slides];
                                        newSlides[activeSlideIndex] = { ...activeSlide, contentPoints: e.target.value.split('\n') };
                                        setSlides(newSlides);
                                    }}
                                    placeholder="输入内容要点..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Arrow Indicator */}
                    <div className="flex justify-center -my-2 flex-shrink-0">
                        <div className="bg-white p-1 rounded-full border border-gray-200 shadow-sm z-10 text-gray-400">
                            <Zap className="w-4 h-4" />
                        </div>
                    </div>

                    {/* Window 2: Prompt Control */}
                    <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 relative overflow-hidden flex flex-col shadow-sm">
                        {/* Background Decor */}
                        <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-100 rounded-full opacity-20 -mr-10 -mt-10"></div>
                        
                        <div className="flex items-center justify-between gap-2 mb-3 relative z-10 flex-shrink-0">
                            <div className="flex items-center gap-2 text-blue-700">
                                <ImageIcon className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wide">窗口二：配图控制</span>
                            </div>
                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold border border-yellow-200">
                                Gemini 3 Pro Image
                            </span>
                        </div>

                        <div className="space-y-3 relative z-10">
                            <div className="relative">
                                <textarea 
                                    className="w-full text-xs text-gray-600 bg-white p-3 rounded-lg border border-blue-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y min-h-[100px] leading-relaxed shadow-sm custom-scrollbar"
                                    value={localImagePrompt}
                                    onChange={(e) => setLocalImagePrompt(e.target.value)}
                                    placeholder="Prompt will appear here..."
                                />
                                <button 
                                    onClick={handleAutoOptimizePrompt}
                                    disabled={isPromptRegenerating}
                                    className="absolute bottom-2 right-2 p-1.5 bg-gray-100 hover:bg-white text-gray-500 hover:text-blue-600 rounded-md border border-gray-200 transition-colors shadow-sm"
                                    title="Refine Prompt for Text-In-Image"
                                >
                                    {isPromptRegenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                </button>
                            </div>

                            <button 
                                onClick={handleSaveImagePrompt}
                                disabled={activeSlide.isGeneratingImage}
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-bold py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all flex justify-center items-center shadow-md disabled:opacity-70 active:scale-[0.98]"
                            >
                                {activeSlide.isGeneratingImage ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        正在渲染全图...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="w-4 h-4 mr-2" />
                                        生成全页 PPT (含文字)
                                    </>
                                )}
                            </button>
                            
                            <div className="text-[10px] text-gray-500 text-center mt-1">
                                * 文字将由 AI 直接渲染在图片中
                            </div>
                        </div>
                    </div>

                    {/* Window 3: Knowledge Graph */}
                    <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-4 relative overflow-hidden flex-shrink-0 shadow-sm">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-purple-100 rounded-full opacity-20 -mr-10 -mt-10"></div>
                        
                        <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
                            <div className="flex items-center gap-2 text-purple-700">
                                <Network className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wide">窗口三：逻辑图谱</span>
                            </div>
                        </div>

                        <div className="space-y-3 relative z-10">
                            <p className="text-xs text-gray-500 leading-snug">
                            分析本页内容，使用 Gemini 3 Pro Image 生成专业的知识架构图或流程图。
                            </p>
                            <button 
                                onClick={handleGenerateKnowledgeGraph}
                                disabled={activeSlide.isGeneratingImage}
                                className="w-full bg-white border border-purple-200 text-purple-700 text-sm font-bold py-2.5 rounded-lg hover:bg-purple-50 transition-all flex justify-center items-center shadow-sm disabled:opacity-70"
                            >
                                {activeSlide.isGeneratingImage ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4 mr-2" />
                                        生成知识架构图
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Secondary Controls (Theme & Layout) */}
                    <div className="space-y-4 pt-4 border-t border-gray-100 flex-shrink-0">
                        {/* Theme */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-gray-700 font-bold text-xs">
                                <span>风格主题</span>
                            </div>
                            <div className="grid grid-cols-5 gap-2">
                                {THEMES.map(theme => (
                                    <button
                                        key={theme.id}
                                        title={theme.name}
                                        onClick={() => setCurrentTheme(theme)}
                                        className={`w-full aspect-square rounded-lg border-2 shadow-sm transition-all hover:scale-105 ${currentTheme.id === theme.id ? 'border-gray-800 ring-1 ring-gray-200' : 'border-transparent'}`}
                                        style={{ backgroundColor: theme.colors.primary }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Layout */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-gray-700 font-bold text-xs">
                                <span>板式布局</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: SlideLayout.TextOnly, label: '纯文本' },
                                    { id: SlideLayout.ImageRight, label: '左文右图' },
                                    { id: SlideLayout.ImageLeft, label: '左图右文' },
                                    { id: SlideLayout.Center, label: '居中聚焦' },
                                    { id: SlideLayout.AiBackground, label: 'AI 全图' }
                                ].map(layout => (
                                <button 
                                    key={layout.id}
                                    onClick={() => {
                                        const newSlides = [...slides];
                                        newSlides[activeSlideIndex].layout = layout.id;
                                        setSlides(newSlides);
                                    }}
                                    className={`text-[10px] py-1.5 px-2 border rounded-md transition-colors font-medium text-center
                                        ${activeSlide.layout === layout.id 
                                            ? 'border-blue-600 bg-blue-50 text-blue-700' 
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {layout.label}
                                </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
           
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2 flex-shrink-0">
                    <button 
                        onClick={handleExportPPTX}
                        className="flex-1 bg-white border border-orange-200 text-orange-700 py-2.5 rounded-lg hover:bg-orange-50 flex items-center justify-center space-x-1 shadow-sm font-bold text-xs transition-colors"
                    >
                        <FileDown className="w-4 h-4" />
                        <span>PPTX</span>
                    </button>

                    <button 
                        onClick={handleExportPDF}
                        className="flex-1 bg-white border border-green-200 text-green-700 py-2.5 rounded-lg hover:bg-green-50 flex items-center justify-center space-x-1 shadow-sm font-bold text-xs transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        <span>PDF</span>
                    </button>
                </div>
            </div>
        )}

      </div>
    );
  };
  
  const renderExportStage = () => (
     <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center">
        <div ref={exportContainerRef} className="bg-gray-200 p-10 overflow-auto max-h-screen max-w-screen">
           {/* Render all slides vertically for capture */}
           {slides.map((slide, idx) => (
              <div key={idx} className="mb-8 slide-export-node shadow-2xl">
                 <SlideRenderer slide={slide} theme={currentTheme} scale={1} />
              </div>
           ))}
        </div>
        <div className="fixed top-0 left-0 w-full h-full bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center z-50">
           <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center border border-gray-100">
               <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
               <p className="text-xl font-bold text-gray-800">{loadingMessage}</p>
               <p className="text-sm text-gray-500 mt-2">正在处理高分辨率图像，请勿关闭窗口...</p>
           </div>
        </div>
     </div>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-gray-900">
      {/* Settings Modal */}
      {renderSettingsModal()}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center space-x-3">
           <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-lg">P</span>
           </div>
           <div>
               <h1 className="text-lg font-bold text-gray-800 leading-tight">
                 智能PPT工作台
               </h1>
               <p className="text-[10px] text-gray-500 font-medium tracking-wide">AI PRESENTATION MASTER</p>
           </div>
        </div>
        <div className="flex items-center space-x-3">
           
           <button 
                onClick={() => setIsSettingsOpen(true)}
                className="text-gray-500 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100"
                title="设置 & API Key"
           >
                <Settings className="w-5 h-5" />
           </button>

           {onReset && (
             <button 
                onClick={onReset}
                className="text-xs text-gray-500 hover:text-red-600 font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 border border-transparent hover:border-red-100"
                title="退出并清除 Key"
             >
                <LogOut className="w-4 h-4" />
                <span>退出</span>
             </button>
           )}

           {stage !== AppStage.Input && (
             <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200 ml-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs font-medium text-gray-600">Gemini 3 Pro Active</span>
             </div>
           )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative bg-gray-50/50 flex flex-col">
         {isLoading && stage !== AppStage.Export && (
           <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
              <div className="flex flex-col items-center bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                  <p className="font-bold text-gray-800 text-lg">{loadingMessage}</p>
              </div>
           </div>
         )}

         {/* Navigation Stepper (Global) */}
         {stage !== AppStage.Export && renderStepper()}
         
         {stage === AppStage.Input && renderInputStage()}
         {stage === AppStage.Outline && renderOutlineStage()}
         {stage === AppStage.Editor && renderEditorStage()}
         {stage === AppStage.Export && renderExportStage()}
      </main>
    </div>
  );
};

export default PPTWorkbench;