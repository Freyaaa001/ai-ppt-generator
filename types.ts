export enum SlideType {
  Cover = 'cover',
  Section = 'section',
  Content = 'content',
  End = 'end'
}

export enum SlideLayout {
  TextOnly = 'text-only',
  ImageRight = 'text-image-right',
  ImageLeft = 'text-image-left',
  Center = 'center',
  AiBackground = 'ai-background' // New layout for full page AI images
}

export interface SlideData {
  id: string;
  type: SlideType;
  layout: SlideLayout;
  title: string;
  subTitle?: string;
  contentPoints: string[]; // Bullet points
  speakerNotes: string;
  imagePrompt: string; // The prompt used to generate the image
  imageUrl?: string; // The actual generated image URL (or placeholder)
  isGeneratingImage?: boolean;
}

export interface PresentationConfig {
  themeColor: string;
  targetSlideCount: number;
}

export enum AppStage {
  Input = 'input',
  Outline = 'outline',
  Editor = 'editor',
  Export = 'export'
}

export interface AppTheme {
  id: string;
  name: string;
  colors: {
    primary: string;   // Main brand color (headers, accents)
    secondary: string; // Lighter accent (background highlights)
    background: string; // Slide background
    text: string;      // Main text color
    textLight: string; // Lighter text (subtitles)
    accent: string;    // Special emphasis
  }
}

export const THEMES: AppTheme[] = [
  {
    id: 'corporate-blue',
    name: '商务深蓝',
    colors: {
      primary: '#1E40AF', // blue-800
      secondary: '#EFF6FF', // blue-50
      background: '#FFFFFF',
      text: '#1F2937', // gray-800
      textLight: '#4B5563', // gray-600
      accent: '#2563EB', // blue-600
    }
  },
  {
    id: 'emerald-growth',
    name: '翡翠森系',
    colors: {
      primary: '#065F46', // emerald-800
      secondary: '#ECFDF5', // emerald-50
      background: '#FFFFFF',
      text: '#064E3B', // emerald-900
      textLight: '#374151', 
      accent: '#10B981', // emerald-500
    }
  },
  {
    id: 'minimal-gray',
    name: '极简黑白',
    colors: {
      primary: '#111827', // gray-900
      secondary: '#F3F4F6', // gray-100
      background: '#FFFFFF',
      text: '#000000',
      textLight: '#4B5563',
      accent: '#374151', // gray-700
    }
  },
  {
    id: 'tech-purple',
    name: '科技紫韵',
    colors: {
      primary: '#5B21B6', // violet-800
      secondary: '#F5F3FF', // violet-50
      background: '#FFFFFF',
      text: '#1F2937',
      textLight: '#4C1D95',
      accent: '#7C3AED', // violet-600
    }
  },
  {
    id: 'warm-orange',
    name: '活力暖橙',
    colors: {
      primary: '#C2410C', // orange-700
      secondary: '#FFF7ED', // orange-50
      background: '#FFFFFF',
      text: '#431407', // orange-950
      textLight: '#78350F',
      accent: '#EA580C', // orange-600
    }
  }
];