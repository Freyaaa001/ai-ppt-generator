import { GoogleGenAI, Type } from "@google/genai";
import { SlideData, SlideType, SlideLayout, AppTheme } from '../types';

// Store the API Key in a module-level variable
// SECURITY: Do not fallback to process.env to prevent accidental leakage in public repos.
let globalApiKey: string = '';

/**
 * Sets the API Key dynamically from the UI.
 * Sanitizes input to prevent header errors.
 */
export const setApiKey = (key: string) => {
  // Sanitize: Remove non-ASCII characters and whitespace
  // This prevents "String contains non ISO-8859-1 code point" error in Headers
  globalApiKey = key.replace(/[^\x00-\x7F]/g, "").trim();
};

/**
 * Tests if the provided API Key is valid by making a lightweight request.
 */
export const testApiKey = async (apiKey: string): Promise<boolean> => {
    // Sanitize locally for the test as well
    const sanitizedKey = apiKey.replace(/[^\x00-\x7F]/g, "").trim();
    const ai = new GoogleGenAI({ apiKey: sanitizedKey });
    try {
        // Use Flash model for a quick and cheap ping
        await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'ping',
        });
        return true;
    } catch (error) {
        console.error("API Key Test Failed:", error);
        throw error;
    }
};

const getAiClient = () => {
  if (!globalApiKey) {
    throw new Error("API Key 未配置。请在入口页面输入您的 Google API Key。");
  }
  return new GoogleGenAI({ apiKey: globalApiKey });
};

// Model Constants
const TEXT_MODEL = 'gemini-3-pro-preview'; 
const TEXT_MODEL_FALLBACK = 'gemini-3-flash-preview';
// UPGRADE: Using the strongest model 'Gemini 3 Pro Image' for high-fidelity backgrounds
const IMAGE_MODEL_MAIN = 'gemini-3-pro-image-preview'; 

/**
 * Generates a PPT structure (Outline) from raw text.
 */
export const generateOutline = async (
  rawText: string, 
  slideCount: number,
  purpose: string = '工作汇报',
  density: string = 'standard', // 'standard' | 'detailed'
  customInstruction: string = '' // New parameter for special requirements
): Promise<SlideData[]> => {
  const ai = getAiClient();

  // Logic based on Density
  const isDetailed = density === 'detailed';
  const pointsLimit = isDetailed ? "5-8" : "3-5";
  const pointsLength = isDetailed ? "50" : "25";
  const toneInstruction = isDetailed 
    ? "内容详实，提供充分的解释和数据支撑，适合阅读。" 
    : "极端精简，只保留核心关键词和短语，适合演讲投影。";

  // Prompt engineered for strict JSON output and Chinese Business content
  const prompt = `
    你是一位资深的商务演示文稿专家。你的任务是基于提供的输入材料，制作一份结构清晰、逻辑严密、专业度高的PPT大纲。

    输入材料内容如下：
    """
    ${rawText.substring(0, 40000)}
    """

    【场景设定】
    - **PPT用途**: ${purpose} (请根据此用途调整语气和侧重点，例如教学课件应重解释，工作汇报应重结论)
    - **内容密度**: ${isDetailed ? "详细模式" : "精简模式"} (${toneInstruction})

    【用户特殊指令/额外要求】
    ${customInstruction ? `用户特别强调: "${customInstruction}"。请务必在生成大纲时优先满足此要求。` : "无特殊要求，请按通用标准生成。"}

    【任务要求】
    1. **核心提炼**：深入分析文档，识别关键结论、数据支撑和行动建议。
    2. **页数控制**：严格规划约 ${slideCount} 页的内容。
    3. **语言要求**：所有输出必须是**简体中文**。
    4. **结构安排**：
       - **封面 (cover)**：主标题要简练且具吸引力，副标题说明汇报语境。
       - **目录/过渡 (section)**：合理划分章节，每3-5页内容应有一个明确的章节过渡页。
       - **内容页 (content)**：每一页只讲一个核心观点。要点(contentPoints)限制在 ${pointsLimit} 条以内，每条不超过 ${pointsLength} 字。
       - **结束页 (end)**：致谢或Q&A。
    5. **视觉指令 (imagePrompt)**：
       - 为每一页生成具体的英文绘图提示词。
       - 关键词：Minimalist corporate poster, infographic style.
       - 描述：Design a full slide layout for [Title].

    请输出符合 Schema 的 JSON 数组。
  `;

  const generateWithModel = async (model: string) => {
     const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['cover', 'section', 'content', 'end'] },
                title: { type: Type.STRING },
                subTitle: { type: Type.STRING },
                contentPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                speakerNotes: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                layout: { type: Type.STRING, enum: ['text-only', 'text-image-right', 'text-image-left', 'center', 'ai-background'] },
              },
              required: ['type', 'title', 'contentPoints', 'speakerNotes', 'imagePrompt', 'layout']
            }
          }
        }
      });
      return JSON.parse(response.text || '[]');
  };

  const processSlides = (rawSlides: any[]) => {
      return rawSlides.map((s: any, index: number) => ({
        ...s,
        id: `slide-${Date.now()}-${index}`,
        imageUrl: '',
        // Default to ai-background for full image generation experience
        layout: SlideLayout.AiBackground
      }));
  };

  // Improved Retry Logic: Pro -> Flash Fallback
  // We prioritize Pro for quality, but switch to Flash immediately on error to avoid 500 loops.
  try {
      console.log(`Generating outline with ${TEXT_MODEL}...`);
      const rawSlides = await generateWithModel(TEXT_MODEL);
      return processSlides(rawSlides);
  } catch (e: any) {
      console.warn(`Outline Gen (Pro) failed: ${e.message}. Switching to Flash (${TEXT_MODEL_FALLBACK})...`);
      
      try {
          // Fallback to Flash
          const rawSlides = await generateWithModel(TEXT_MODEL_FALLBACK);
          return processSlides(rawSlides);
      } catch (fallbackError: any) {
          console.error(`Outline Gen (Flash) failed: ${fallbackError.message}`);
          throw new Error(`大纲生成失败: Google 服务繁忙 (500)，请稍后重试。`);
      }
  }
};

/**
 * Generates an image prompt based on the slide content.
 * Updated to ask for TEXT INCLUSION.
 */
export const generateImagePromptFromContent = async (slide: SlideData): Promise<string> => {
  const ai = getAiClient();
  const prompt = `
    Generate a detailed PROMPT for an AI Image Generator.
    The goal is to generate a **COMPLETE PPT SLIDE IMAGE** that includes BOTH the background design AND the text content rendered directly into the image.
    
    Slide Data:
    - Title: "${slide.title}"
    - Content: "${slide.contentPoints.join('; ')}"
    
    Instruction:
    Write a prompt that instructs the image model to:
    1. Create a professional presentation slide layout.
    2. RENDER the text (Title and Points) legibly using high-contrast typography.
    3. Use a specific visual style (Modern, Minimalist, Tech, etc.).
    
    JSON Output: { "imagePrompt": "..." }
  `;

  // Helper
  const genPrompt = async (model: string) => {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              imagePrompt: { type: Type.STRING }
            }
          }
        }
      });
      return JSON.parse(response.text || '{}');
  };

  try {
      const result = await genPrompt(TEXT_MODEL);
      return result.imagePrompt || `Full slide design for "${slide.title}", professional typography, legible text.`;
  } catch (e) {
      console.warn("Prompt generation (Pro) failed, trying Flash...");
      try {
          const result = await genPrompt(TEXT_MODEL_FALLBACK);
          return result.imagePrompt || `Full slide design for "${slide.title}", professional typography, legible text.`;
      } catch (ex) {
          return `Full slide design for "${slide.title}", professional typography, legible text.`;
      }
  }
};

/**
 * Generates a FULL SLIDE IMAGE (Text + Graphics) using Gemini 3 Pro Image.
 */
export const generateSlideImage = async (
    slide: SlideData, 
    theme: AppTheme, 
    userInstruction: string = ''
): Promise<string> => {
  const ai = getAiClient();
  
  const contentText = slide.contentPoints.map(p => `• ${p}`).join('\n');
  const colorContext = `Palette: ${theme.colors.primary} (Main), ${theme.colors.accent} (Accent), White Background`;
  
  // Use user's manual imagePrompt if available, but wrap it with strict formatting requirements
  const coreStyle = slide.imagePrompt.length > 5 ? slide.imagePrompt : `Professional business presentation slide for ${slide.title}`;

  const fullPrompt = `
    **TASK**: Generate a SINGLE, COMPLETE, HIGH-RESOLUTION PRESENTATION SLIDE (16:9).
    
    **CRITICAL REQUIREMENT**: 
    You must RENDER the following specific Chinese text onto the image. The text must be legible, spelled correctly, and professional.
    
    --- TEXT TO RENDER ---
    TITLE: ${slide.title}
    BODY:
    ${contentText}
    ----------------------
    
    **DESIGN SPECIFICATIONS**:
    - STYLE: ${theme.name} (${colorContext}).
    - LAYOUT: Professional typographic layout. Title prominent at top or left. Body text organized clearly.
    - VISUALS: ${coreStyle}. Integrate abstract graphics or photos that support the topic, but do not obscure the text.
    - USER INSTRUCTION: ${userInstruction}
    
    Output a photorealistic or high-quality vector graphic image of the final slide.
  `;

  return await callImageModel(ai, fullPrompt, "2K");
};

/**
 * Generates a KNOWLEDGE GRAPH / DIAGRAM for the slide.
 */
export const generateKnowledgeGraph = async (
    slide: SlideData,
    theme: AppTheme
): Promise<string> => {
    const ai = getAiClient();
    const context = slide.contentPoints.join(', ');
    const colorContext = `Use colors: ${theme.colors.primary}, ${theme.colors.accent}, white background`;

    const fullPrompt = `
      Create a high-quality professional business chart, infographic, or knowledge graph diagram that visualizes the following content.
      
      **Content to Visualize**:
      Title: ${slide.title}
      Key Points: ${context}
      
      **Design Requirements**:
      - TYPE: Flowchart, Mind Map, or Conceptual Architecture Diagram.
      - STYLE: Modern flat vector design, high readability, clean white background.
      - COLOR: ${colorContext}.
      - DETAIL: Include simplified text labels relevant to the topic inside the diagram boxes/nodes.
      - QUALITY: High resolution, professional presentation asset.
      
      Generate a clean, standalone diagram on a white background.
    `;

    return await callImageModel(ai, fullPrompt, "2K");
};

// Helper to handle retries and 500 errors for image model
// STRICTLY Gemini 3 Pro Image (No Fallback)
async function callImageModel(ai: GoogleGenAI, prompt: string, size: string = "1K"): Promise<string> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: IMAGE_MODEL_MAIN,
                contents: { parts: [{ text: prompt.substring(0, 1500) }] },
                config: {
                    imageConfig: {
                        aspectRatio: "16:9",
                        imageSize: size // Only supported by Pro Image
                    }
                }
            });

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
             // If no image data, throw to trigger retry
            throw new Error("No image data returned from Pro model.");
        } catch (error: any) {
            console.warn(`Pro Image Gen Attempt ${attempt + 1} failed:`, error.message);
            lastError = error;
            // Wait slightly before retry
            if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
    }

    throw lastError || new Error("Image generation failed (500 Internal Error).");
}

/**
 * Regenerate content for a specific slide based on user instruction.
 */
export const refineSlideContent = async (currentSlide: SlideData, instruction: string): Promise<Partial<SlideData>> => {
  const ai = getAiClient();
  
  const prompt = `
    你是一个专业的PPT内容编辑。请根据用户的指令修改当前页面的内容。
    
    【当前页面数据】
    标题: ${currentSlide.title}
    要点: ${JSON.stringify(currentSlide.contentPoints)}
    演讲备注: ${currentSlide.speakerNotes}
    
    【用户修改指令】
    "${instruction}"
    
    【要求】
    1. 输出语言必须是**简体中文**。
    2. 保持商务专业语气。
    3. 仅返回修改后的 JSON 对象 (title, contentPoints, speakerNotes)。
  `;

  const genRefine = async (model: string) => {
    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
            title: { type: Type.STRING },
            contentPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            speakerNotes: { type: Type.STRING },
            }
        }
        }
    });
    return JSON.parse(response.text || '{}');
  }

  // Improved Retry: Pro -> Flash Fallback
  try {
      return await genRefine(TEXT_MODEL);
  } catch (e) {
      console.warn("Refine (Pro) failed, switching to Flash...");
      try {
          return await genRefine(TEXT_MODEL_FALLBACK);
      } catch(ex) { 
          throw e; 
      }
  }
};