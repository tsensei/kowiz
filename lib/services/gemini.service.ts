import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';
import { z } from 'zod';

// Schema for AI-generated metadata
const metadataSchema = z.object({
  title: z.string().describe('A descriptive, Commons-friendly filename without extension (avoid generic names like IMG_1234). Max 100 characters.'),
  description: z.string().describe('A detailed, encyclopedic description of what the image shows. Include key details, context, and notable elements. Target 50-200 words (250-1000 characters).'),
  suggestedCategories: z.array(z.string()).min(2).max(5).describe('Between 2-5 relevant Wikimedia Commons categories (without the "Category:" prefix)'),
});

export type AIGeneratedMetadata = z.infer<typeof metadataSchema>;

export class GeminiService {
  private client!: GoogleGenAI;
  private enabled: boolean;

  constructor() {
    // Feature flag: check if AI assistance is enabled
    this.enabled = process.env.ENABLE_AI_ASSISTANCE === 'true';

    if (!this.enabled) {
      console.log('AI-assisted metadata creation is disabled (ENABLE_AI_ASSISTANCE is not set to "true")');
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('AI-assisted metadata creation is enabled but GEMINI_API_KEY is not set');
      this.enabled = false;
      return;
    }
    // Initialize client with API key
    // Note: For server-side usage, ensure your API key doesn't have HTTP referrer restrictions
    // or configure it to allow requests from your server
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Check if AI assistance is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate Commons-friendly metadata from an image buffer with user-provided context
   * Uses Gemini's vision + structured output capabilities
   * AI-assisted: User provides keywords/context, AI enhances the description
   */
  async generateMetadataFromImage(
    imageBuffer: Buffer,
    mimeType: string,
    originalFilename: string,
    userContext?: string
  ): Promise<AIGeneratedMetadata> {
    if (!this.enabled) {
      throw new Error('AI-assisted metadata creation is disabled. Set ENABLE_AI_ASSISTANCE=true in your environment variables.');
    }

    try {
      const base64Image = imageBuffer.toString('base64');

      const prompt = `
# Role
You are an expert at creating Wikimedia Commons metadata. You help photographers write clear, descriptive titles and descriptions for their real photographs.

# Context
- This is a REAL photograph taken by a user (not AI-generated)
- You're helping write better metadata (title & description) by analyzing the image
- The user may have provided some keywords or context${userContext ? '\n- This metadata will be marked as "AI-assisted" (meaning the description writing was assisted, not the photo)' : ''}

${userContext ? `# User's Keywords/Context\n${userContext}\n\nUse these keywords as your starting point. Build upon what the user provided by adding visual details you observe in the image.\n` : ''}
# Task
Analyze the photograph and create metadata following Wikimedia Commons standards.

## Output Format

**Title** (max 100 characters):
- Descriptive filename without extension
- Use underscores instead of spaces
- Include key details: subject, location, or distinguishing features${userContext ? '\n- Incorporate the user\'s keywords naturally' : ''}
- Avoid generic names like "IMG_1234" or "Photo"
- Example: "Sunset_over_Golden_Gate_Bridge_San_Francisco_2024"

**Description** (50-200 words):
- Write naturally as a human would describe what they see${userContext ? '\n- Begin with or incorporate the user\'s context' : ''}
- Be specific about visible elements: subjects, colors, composition, lighting
- Add relevant context: location, time of day, notable features
- Use encyclopedic tone - objective and informative
- Write in complete sentences
- Do NOT mention "AI" or "AI-assisted" in the text (this is handled separately)

**Categories** (2-5 suggestions):
- Suggest specific Wikimedia Commons categories
- Prefer specific over generic (e.g., "Sunsets in California" not just "Sunsets")
- Omit the "Category:" prefix
- Use proper capitalization

# Reference
Original filename: ${originalFilename}

# Important Constraints
- Title: Maximum 100 characters, no file extension
- Description: 50-200 words (250-1000 characters)
- Categories: Exactly 2-5 suggestions
- Write as if you're a knowledgeable human describing the photograph
`.trim();

      // Define function declaration for structured output
      const createMetadataFunction = {
        name: 'create_metadata',
        description: 'Creates structured metadata for a Wikimedia Commons upload',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'A descriptive, Commons-friendly filename without extension. Max 100 characters.',
            },
            description: {
              type: Type.STRING,
              description: 'A detailed, encyclopedic description of what the image shows. Target 50-200 words.',
            },
            suggestedCategories: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Between 2-5 relevant Wikimedia Commons categories (without the "Category:" prefix)',
            },
          },
          required: ['title', 'description', 'suggestedCategories'],
        },
      };

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          { text: prompt },
        ],
        config: {
          tools: [{
            functionDeclarations: [createMetadataFunction]
          }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['create_metadata']
            }
          },
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      });

      console.log('Gemini raw response:', JSON.stringify(response, null, 2));

      // Check if response was truncated due to token limit
      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('Response was truncated due to token limit. The image may be too complex or the description too long.');
      }

      // Extract function call
      if (!response.functionCalls || response.functionCalls.length === 0) {
        throw new Error('Gemini did not return a function call');
      }

      const functionCall = response.functionCalls[0];
      console.log('Function call:', JSON.stringify(functionCall, null, 2));

      if (functionCall.name !== 'create_metadata') {
        throw new Error(`Unexpected function call: ${functionCall.name}`);
      }

      // The args are already properly typed by the function calling system
      const metadata = metadataSchema.parse(functionCall.args);
      return metadata;
    } catch (error) {
      console.error('Gemini metadata generation error:', error);
      throw new Error('Failed to generate metadata with AI');
    }
  }

  /**
   * Generate metadata from a file URI (for files uploaded via Files API) with user-provided context
   * AI-assisted: User provides keywords/context, AI enhances the description
   */
  async generateMetadataFromFileUri(
    fileUri: string,
    mimeType: string,
    originalFilename: string,
    userContext?: string
  ): Promise<AIGeneratedMetadata> {
    if (!this.enabled) {
      throw new Error('AI-assisted metadata creation is disabled. Set ENABLE_AI_ASSISTANCE=true in your environment variables.');
    }

    try {
      const prompt = `
# Role
You are an expert at creating Wikimedia Commons metadata. You help photographers write clear, descriptive titles and descriptions for their real photographs.

# Context
- This is a REAL photograph taken by a user (not AI-generated)
- You're helping write better metadata (title & description) by analyzing the image
- The user may have provided some keywords or context${userContext ? '\n- This metadata will be marked as "AI-assisted" (meaning the description writing was assisted, not the photo)' : ''}

${userContext ? `# User's Keywords/Context\n${userContext}\n\nUse these keywords as your starting point. Build upon what the user provided by adding visual details you observe in the image.\n` : ''}
# Task
Analyze the photograph and create metadata following Wikimedia Commons standards.

## Output Format

**Title** (max 100 characters):
- Descriptive filename without extension
- Use underscores instead of spaces
- Include key details: subject, location, or distinguishing features${userContext ? '\n- Incorporate the user\'s keywords naturally' : ''}
- Avoid generic names like "IMG_1234" or "Photo"
- Example: "Sunset_over_Golden_Gate_Bridge_San_Francisco_2024"

**Description** (50-200 words):
- Write naturally as a human would describe what they see${userContext ? '\n- Begin with or incorporate the user\'s context' : ''}
- Be specific about visible elements: subjects, colors, composition, lighting
- Add relevant context: location, time of day, notable features
- Use encyclopedic tone - objective and informative
- Write in complete sentences
- Do NOT mention "AI" or "AI-assisted" in the text (this is handled separately)

**Categories** (2-5 suggestions):
- Suggest specific Wikimedia Commons categories
- Prefer specific over generic (e.g., "Sunsets in California" not just "Sunsets")
- Omit the "Category:" prefix
- Use proper capitalization

# Reference
Original filename: ${originalFilename}

# Important Constraints
- Title: Maximum 100 characters, no file extension
- Description: 50-200 words (250-1000 characters)
- Categories: Exactly 2-5 suggestions
- Write as if you're a knowledgeable human describing the photograph
`.trim();

      // Define function declaration for structured output
      const createMetadataFunction = {
        name: 'create_metadata',
        description: 'Creates structured metadata for a Wikimedia Commons upload',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'A descriptive, Commons-friendly filename without extension. Max 100 characters.',
            },
            description: {
              type: Type.STRING,
              description: 'A detailed, encyclopedic description of what the image shows. Target 50-200 words.',
            },
            suggestedCategories: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Between 2-5 relevant Wikimedia Commons categories (without the "Category:" prefix)',
            },
          },
          required: ['title', 'description', 'suggestedCategories'],
        },
      };

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            fileData: {
              mimeType,
              fileUri,
            },
          },
          { text: prompt },
        ],
        config: {
          tools: [{
            functionDeclarations: [createMetadataFunction]
          }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['create_metadata']
            }
          },
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      });

      console.log('Gemini raw response:', JSON.stringify(response, null, 2));

      // Check if response was truncated due to token limit
      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('Response was truncated due to token limit. The image may be too complex or the description too long.');
      }

      // Extract function call
      if (!response.functionCalls || response.functionCalls.length === 0) {
        throw new Error('Gemini did not return a function call');
      }

      const functionCall = response.functionCalls[0];
      console.log('Function call:', JSON.stringify(functionCall, null, 2));

      if (functionCall.name !== 'create_metadata') {
        throw new Error(`Unexpected function call: ${functionCall.name}`);
      }

      // The args are already properly typed by the function calling system
      const metadata = metadataSchema.parse(functionCall.args);
      return metadata;
    } catch (error) {
      console.error('Gemini metadata generation error:', error);
      throw new Error('Failed to generate metadata with AI');
    }
  }
}

export const geminiService = new GeminiService();
