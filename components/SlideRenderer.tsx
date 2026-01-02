import React from 'react';
import { SlideData, SlideType, SlideLayout, AppTheme } from '../types';

interface SlideRendererProps {
  slide: SlideData;
  theme: AppTheme;
  scale?: number;
  className?: string;
  id?: string;
}

const SlideRenderer: React.FC<SlideRendererProps> = ({ 
  slide, 
  theme,
  scale = 1, 
  className = '', 
  id
}) => {
  // 16:9 Aspect Ratio Base Size (960x540)
  const baseWidth = 960;
  const baseHeight = 540;

  const style = {
    width: `${baseWidth}px`,
    height: `${baseHeight}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
  };

  const { colors } = theme;

  // --- Helper: Adaptive Text Sizing ---
  const getAdaptiveStyles = (title: string, points: string[]) => {
      const totalLength = (title?.length || 0) + points.join('').length;
      const lineCount = points.length + (title?.length > 20 ? 2 : 1);
      
      // Default: Comfortable sizes
      let titleSize = '2.5rem'; // ~40px
      let bodySize = '1.35rem'; // ~22px
      let spaceY = '1.5rem';    // Gap between title/points
      let pointGap = '1rem';    // Gap between points
      let containerPadding = '3rem';

      if (totalLength > 400 || lineCount > 12) {
          titleSize = '1.8rem';
          bodySize = '0.9rem';
          spaceY = '0.75rem';
          pointGap = '0.35rem';
          containerPadding = '1.5rem';
      } else if (totalLength > 250 || lineCount > 9) {
          titleSize = '2rem';
          bodySize = '1rem';
          spaceY = '1rem';
          pointGap = '0.5rem';
          containerPadding = '2rem';
      } else if (totalLength > 150 || lineCount > 7) {
          titleSize = '2.2rem';
          bodySize = '1.15rem';
          spaceY = '1.25rem';
          pointGap = '0.75rem';
          containerPadding = '2.5rem';
      }

      return { titleSize, bodySize, spaceY, pointGap, containerPadding };
  };

  // --- Components ---
  
  const Footer = ({ isDark = false }) => (
    <div className={`absolute bottom-0 left-0 w-full h-12 flex items-center justify-between px-12 border-t ${isDark ? 'border-white/20 text-white/60' : 'border-black/10 text-black/40'}`}>
        <span className="text-[10px] font-bold tracking-widest uppercase">
            CONFIDENTIAL PRESENTATION
        </span>
        <div className="flex items-center gap-2">
            <div className={`h-1 w-8 rounded-full opacity-30 ${isDark ? 'bg-white' : 'bg-gray-800'}`}></div>
            <span className="text-xs font-mono font-bold opacity-60">
               AI PPT
            </span>
        </div>
    </div>
  );

  const renderContent = () => {
    // If the slide has a custom AI background layout AND an image
    const isAiBg = slide.layout === SlideLayout.AiBackground && !!slide.imageUrl;

    if (isAiBg) {
        const { titleSize, bodySize, spaceY, pointGap, containerPadding } = getAdaptiveStyles(slide.title, slide.contentPoints);

        return (
            <div className="h-full w-full relative overflow-hidden bg-white">
                {/* Background Image Layer */}
                <img 
                    src={slide.imageUrl} 
                    alt="AI Generated Background" 
                    className="absolute inset-0 w-full h-full object-cover z-0" 
                />
                
                {/* Text Overlay Layer - Glassmorphism Card */}
                <div className="absolute inset-0 z-10 p-12 flex flex-col justify-center items-center">
                    <div 
                        className="bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-white/60 w-full max-w-4xl mx-auto flex flex-col justify-center transition-all duration-300"
                        style={{ 
                            padding: containerPadding,
                            minHeight: '40%'
                        }}
                    >
                         <h1 
                            className="font-bold leading-tight" 
                            style={{ 
                                color: colors.primary,
                                fontSize: titleSize,
                                marginBottom: spaceY
                            }}
                         >
                            {slide.title}
                         </h1>
                         <div className="flex-1 flex flex-col justify-center" style={{ gap: pointGap }}>
                            {slide.contentPoints.map((point, idx) => (
                                <div key={idx} className="flex items-start">
                                    <span 
                                        className="mr-3 rounded-full flex-shrink-0 mt-[0.4em]" 
                                        style={{ 
                                            backgroundColor: colors.accent,
                                            width: '0.4em',
                                            height: '0.4em'
                                        }}
                                    ></span>
                                    <p 
                                        className="font-medium leading-snug" 
                                        style={{ 
                                            color: colors.text,
                                            fontSize: bodySize
                                        }}
                                    >
                                        {point}
                                    </p>
                                </div>
                            ))}
                         </div>
                    </div>
                </div>

                <div className="absolute bottom-2 right-2 text-white/40 text-[8px] bg-black/30 px-2 py-0.5 rounded z-20">
                    Background by Gemini 3 Pro
                </div>
            </div>
        );
    }

    // Standard Layouts (Fallback for when image hasn't generated yet OR user chose standard layout)
    switch (slide.type) {
      case SlideType.Cover:
        return (
          <div className="flex flex-col justify-between h-full w-full relative overflow-hidden p-16">
             {/* Background Shapes */}
             <div className="absolute top-0 right-0 w-[400px] h-full opacity-5 transform skew-x-12 translate-x-20" style={{ backgroundColor: colors.primary }}></div>
             <div className="absolute bottom-0 left-0 w-[300px] h-[300px] opacity-5 rounded-full blur-3xl" style={{ backgroundColor: colors.accent }}></div>
             
             {/* Top Brand Area */}
             <div className="z-10 flex items-center gap-3">
                 <div className="w-8 h-8 rounded bg-opacity-10 flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.primary }}></div>
                 </div>
                 <span className="font-bold tracking-widest text-sm opacity-60" style={{ color: colors.text }}>AI PPT WORKBENCH</span>
             </div>

             {/* Main Title Area */}
             <div className="z-10 max-w-2xl mt-12">
                <div className="w-20 h-1.5 mb-8" style={{ backgroundColor: colors.accent }}></div>
                <h1 className="text-6xl font-bold mb-6 leading-tight tracking-tight" style={{ color: colors.primary }}>
                    {slide.title}
                </h1>
                {slide.subTitle && (
                    <h2 className="text-2xl font-light opacity-80 leading-snug" style={{ color: colors.textLight }}>
                        {slide.subTitle}
                    </h2>
                )}
             </div>

             {/* Bottom Info */}
             <div className="z-10 flex justify-between items-end border-t pt-6 opacity-60" style={{ borderColor: colors.textLight }}>
                 <div className="text-sm font-medium">汇报日期: {new Date().toLocaleDateString('zh-CN')}</div>
                 <div className="text-sm font-medium">Generated by Gemini 3 Pro</div>
             </div>
          </div>
        );

      case SlideType.Section:
        return (
          <div className="flex h-full w-full relative overflow-hidden">
             {/* Left color block */}
             <div className="w-1/3 h-full flex flex-col justify-center px-12 relative z-10" style={{ backgroundColor: colors.primary }}>
                 <span className="text-white/20 text-9xl font-bold absolute -left-10 top-20 select-none">#</span>
                 <h2 className="text-4xl font-bold text-white relative z-10 leading-tight">{slide.title}</h2>
                 <div className="w-12 h-1 bg-white/50 mt-8 mb-4"></div>
             </div>
             
             {/* Right content */}
             <div className="w-2/3 h-full flex flex-col justify-center px-20 bg-gray-50 relative">
                 <div className="absolute inset-0 opacity-5" style={{ 
                     backgroundImage: `radial-gradient(${colors.textLight} 1px, transparent 1px)`, 
                     backgroundSize: '20px 20px' 
                 }}></div>
                 {slide.contentPoints.length > 0 && (
                    <p className="text-2xl font-light leading-relaxed" style={{ color: colors.textLight }}>
                        "{slide.contentPoints[0]}"
                    </p>
                 )}
                 <div className="mt-8 flex gap-2">
                     {[1,2,3].map(i => <div key={i} className="w-2 h-2 rounded-full opacity-30" style={{ backgroundColor: colors.text }}></div>)}
                 </div>
             </div>
          </div>
        );

      case SlideType.End:
        return (
          <div className="flex flex-col items-center justify-center h-full w-full relative" style={{ backgroundColor: colors.primary }}>
             <div className="text-center z-10">
                 <h1 className="text-5xl font-bold mb-8 tracking-widest text-white">{slide.title || '感谢观看'}</h1>
                 <p className="text-white/60 text-lg mb-12 tracking-wide font-light">Q & A 交流环节</p>
                 <div className="w-16 h-1 bg-white/30 mx-auto rounded-full"></div>
             </div>
             
             {/* Abstract Circles */}
             <div className="absolute w-[600px] h-[600px] border border-white/5 rounded-full flex items-center justify-center">
                 <div className="w-[400px] h-[400px] border border-white/5 rounded-full"></div>
             </div>
          </div>
        );

      default: // Content Slides (Normal Layouts)
        const hasImage = !!slide.imageUrl;
        const isImgRight = slide.layout === SlideLayout.ImageRight;
        const isCenter = slide.layout === SlideLayout.Center;
        
        // Header for content slides
        const ContentHeader = () => (
            <div className="mb-8">
                <h3 className="text-3xl font-bold mb-3" style={{ color: colors.primary }}>{slide.title}</h3>
                <div className="w-full h-[1px] opacity-20" style={{ backgroundColor: colors.textLight }}></div>
            </div>
        );

        // Standard Layout (Text Only / Left / Right)
        if (!hasImage || slide.layout === SlideLayout.TextOnly) {
           return (
             <div className="h-full w-full p-12 flex flex-col bg-white relative">
                <ContentHeader />
                <div className="flex-1 space-y-6 pr-12 overflow-hidden">
                  {slide.contentPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start group">
                      <div className="mt-2.5 mr-4 w-1.5 h-1.5 rounded-sm flex-shrink-0 transition-all group-hover:scale-125" style={{ backgroundColor: colors.accent }}></div>
                      <p className="text-xl leading-relaxed opacity-90 text-justify" style={{ color: colors.text }}>{point}</p>
                    </div>
                  ))}
                </div>
                <Footer />
             </div>
           );
        }

        if (isCenter) {
             return (
                 <div className="h-full w-full p-12 flex flex-col items-center bg-white relative">
                    <div className="text-center mb-8">
                        <h3 className="text-3xl font-bold mb-4" style={{ color: colors.primary }}>{slide.title}</h3>
                        <div className="w-16 h-1 mx-auto" style={{ backgroundColor: colors.accent }}></div>
                    </div>
                    
                    <div className="flex-1 w-full flex items-center justify-center gap-12">
                        <div className="w-1/2 h-[300px] shadow-lg rounded-lg overflow-hidden border border-gray-100">
                             <img src={slide.imageUrl} alt="Visual" className="w-full h-full object-cover" />
                        </div>
                        <div className="w-1/2 space-y-4">
                            {slide.contentPoints.map((point, idx) => (
                                <div key={idx} className="flex items-start">
                                <span className="mr-3 mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.accent }}></span>
                                <p className="text-lg leading-relaxed" style={{ color: colors.text }}>{point}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Footer />
                 </div>
             )
        }
        
        // Split Layout
        return (
          <div className={`h-full w-full flex ${isImgRight ? 'flex-row' : 'flex-row-reverse'} bg-white`}>
             <div className="w-1/2 p-12 flex flex-col justify-center relative">
                <ContentHeader />
                <div className="space-y-6">
                  {slide.contentPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start">
                       <span className="mr-3 mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.accent }}></span>
                       <p className="text-lg leading-relaxed text-justify" style={{ color: colors.text }}>{point}</p>
                    </div>
                  ))}
                </div>
                <Footer />
             </div>
             <div className="w-1/2 h-full relative bg-gray-50 flex items-center justify-center p-8 overflow-hidden">
                <div className="absolute inset-0 bg-opacity-5" style={{ backgroundColor: colors.secondary }}></div>
                {slide.imageUrl ? (
                  <div className="w-full h-full relative shadow-md rounded-lg overflow-hidden ring-1 ring-black/5">
                    <img src={slide.imageUrl} alt="Slide Visual" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full opacity-40 p-8 text-center border-2 border-dashed rounded-xl" style={{ borderColor: colors.textLight }}>
                    <span className="text-sm font-medium">等待生成配图...</span>
                  </div>
                )}
             </div>
          </div>
        );
    }
  };

  return (
    <div 
      id={id}
      className={`shadow-lg overflow-hidden relative text-left select-none ${className}`} 
      style={style}
    >
      {renderContent()}
    </div>
  );
};

export default SlideRenderer;