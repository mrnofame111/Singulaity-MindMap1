


import { GoogleGenAI, Type } from "@google/genai";
import { AIMindMapNode, AIGenerationOptions, SingularityNode, AIAction, AIGraphResult, NodeType } from "../types";

// Initialize client
const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

/**
 * Generates a full mind map structure based on a user's specific goal/topic.
 */
export const generateMindMapData = async (topic: string): Promise<AIMindMapNode | null> => {
  if (!apiKey) {
    console.error("API_KEY is missing");
    return null;
  }

  const modelId = 'gemini-2.5-flash';
  
  const prompt = `
    You are an expert systems thinker. Create a comprehensive, logically structured mind map for: "${topic}".
    
    Rules:
    1. Root node should be the core concept.
    2. 3-5 Main branches representing key pillars/categories.
    3. Sub-branches should provide actionable details or sub-concepts.
    4. Keep labels concise (1-5 words).
    5. Return valid JSON matching the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            children: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  children: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        children: {
                           type: Type.ARRAY,
                           items: {
                             type: Type.OBJECT,
                             properties: {
                               label: { type: Type.STRING }
                             }
                           }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as AIMindMapNode;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};

/**
 * RAG: Generates a mind map from a large block of text content (e.g. Document/PDF)
 */
export const generateMindMapFromContent = async (content: string): Promise<AIMindMapNode | null> => {
    if (!apiKey) {
        console.error("API_KEY is missing");
        return null;
    }

    // Truncate if absolutely massive, though Flash handles large contexts well.
    // ~500k characters is a safe conservative limit for text-only input without token counting logic
    const safeContent = content.slice(0, 500000); 

    const prompt = `
      Analyze the following document content and structure it into a Mind Map.
      
      The Mind Map should summarize the key concepts, arguments, and details found in the text.
      
      CONTENT:
      """
      ${safeContent}
      """
      
      Rules:
      1. Identify the Main Topic for the Root Node.
      2. Create high-level branches for major sections/themes.
      3. Break down into detailed sub-nodes.
      4. Use concise labels for nodes (max 6 words).
      5. Return purely JSON data matching the schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        label: { type: Type.STRING },
                        children: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    label: { type: Type.STRING },
                                    children: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                label: { type: Type.STRING },
                                                children: {
                                                    type: Type.ARRAY,
                                                    items: {
                                                        type: Type.OBJECT,
                                                        properties: {
                                                            label: { type: Type.STRING }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const text = response.text;
        if (!text) return null;
        return JSON.parse(text) as AIMindMapNode;
    } catch (e) {
        console.error("Gemini RAG Error:", e);
        return null;
    }
};

/**
 * Generates a Flowchart structure (Nodes + Edges)
 */
export const generateFlowchartJson = async (topic: string): Promise<AIGraphResult | null> => {
    if (!apiKey) return null;

    const prompt = `
      Create a flowchart for: "${topic}".
      
      Return a JSON object with:
      - "nodes": Array of { id, label, shape, type }. 
        Shapes must be one of: 'rectangle' (process), 'diamond' (decision), 'rounded' (start/end), 'parallelogram' (input/output).
        Type should generally be 'MAIN' or 'SUB'.
      - "edges": Array of { from, to, label }. 
        'from' and 'to' must match node ids. 'label' is optional (e.g., 'Yes', 'No').
      
      Example IDs: "n1", "n2", "n3".
      Ensure the logical flow is correct.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        nodes: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    label: { type: Type.STRING },
                                    shape: { type: Type.STRING },
                                    type: { type: Type.STRING }
                                }
                            }
                        },
                        edges: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    from: { type: Type.STRING },
                                    to: { type: Type.STRING },
                                    label: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });
        
        return JSON.parse(response.text || "null") as AIGraphResult;
    } catch (e) {
        console.error("Flowchart Error", e);
        return null;
    }
};

// Helper to construct nested schema based on depth
const buildRecursiveSchema = (depth: number): any => {
    if (depth <= 0) {
        return {
            type: Type.OBJECT,
            properties: { label: { type: Type.STRING } }
        };
    }
    
    return {
        type: Type.OBJECT,
        properties: {
            label: { type: Type.STRING },
            children: {
                type: Type.ARRAY,
                items: buildRecursiveSchema(depth - 1)
            }
        }
    };
};

/**
 * Expands a specific node using AI, considering the Global Context of the map.
 * Supports depth for recursive generation.
 */
export const expandNodeWithAI = async (
  label: string, 
  motive: string, 
  allNodes: SingularityNode[],
  options?: AIGenerationOptions
): Promise<AIMindMapNode[]> => {
  if (!apiKey) return [];

  const count = options?.count ?? 3;
  const tone = options?.tone || 'standard';
  const depth = options?.depth || 1;
  
  const existingContext = allNodes.map(n => {
      const parent = allNodes.find(p => p.id === n.parentId);
      return `- ${n.label} (ID: ${n.id}, Parent: ${parent ? parent.label : 'ROOT'})`;
  }).join('\n');
  
  let quantityInstruction = "";
  if (count === 'auto') {
      quantityInstruction = "Determine a logical number of sub-nodes (between 2 and 6) based on topic complexity.";
  } else {
      quantityInstruction = `Create exactly ${count} distinct direct sub-nodes.`;
  }

  const prompt = `
    Role: Expert mind map architect.
    Task: Expand node "${label}" with a depth of ${depth}.
    Motive: "${motive ? motive : 'Expand logically'}".
    Global Context:
    ${existingContext}
    
    Instructions:
    1. NO DUPLICATES.
    2. STRICTLY follow the Motive.
    3. Quantity for first level: ${quantityInstruction}
    4. Tone: ${tone}.
    5. Output: Return a JSON Array of objects. Each object must have a "label" property.
       ${depth > 1 ? `Provide "children" array recursively for ${depth} levels.` : 'Do NOT generate children arrays, just the labels.'}
  `;

  // Dynamically build schema based on requested depth to ensure the model responds correctly
  // We wrap the recursive object in an Array for the top-level response
  const itemSchema = buildRecursiveSchema(depth);
  const schema = {
      type: Type.ARRAY,
      items: itemSchema
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    
    const text = response.text;
    return text ? (JSON.parse(text) as AIMindMapNode[]) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const refineNodeText = async (text: string, tone: string = 'professional'): Promise<string> => {
  if (!apiKey) return text;
  
  const prompt = `Refine this mind map node label. Make it ${tone}, clear, and concise. Return ONLY the text. Text: "${text}"`;
  
  try {
     const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
     });
     return response.text?.trim() || text;
  } catch (e) {
    console.error(e);
    return text;
  }
};

/**
 * Analyzes node content to determine type and color.
 */
export const analyzeNodeContent = async (text: string): Promise<{ type: string, color: string, shape: string } | null> => {
    if(!apiKey) return null;

    const prompt = `
    Analyze the text "${text}" and classify it for a mind map node.
    
    Determine:
    1. Type: 'TASK' (if action item), 'CODE' (if code snippet), 'WARNING' (if risk/alert), 'QUESTION' (if inquiry), 'CONCEPT' (default).
    2. Color: Hex code appropriate for the type (e.g. Red for warning, Green for task, Dark Gray for code, Purple for question).
    3. Shape: 'rectangle', 'diamond' (for questions/decisions), 'rounded' (default).

    Return JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING },
                        color: { type: Type.STRING },
                        shape: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "null");
    } catch (e) {
        return null;
    }
};

/**
 * Generates a summary for a branch of the mind map.
 */
export const summarizeBranch = async (
    rootLabel: string, 
    branchStructure: string
): Promise<string> => {
    if (!apiKey) return "API Key missing.";

    const prompt = `
    You are an intelligent summarizer. 
    
    Task: Summarize the following branch of a mind map.
    Root Concept: "${rootLabel}"
    
    Structure (Parent -> Child relationships):
    ${branchStructure}
    
    Instructions:
    1. Write a concise paragraph (max 3 sentences) capturing the core essence.
    2. Then provide 3 key takeaways in bullet points.
    3. Format as plain text (no markdown bolding/headers, just clean text).
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text?.trim() || "Could not generate summary.";
    } catch (e) {
        console.error("Summary Error", e);
        return "Error generating summary.";
    }
};

export const chatWithMapContext = async (
    userMessage: string, 
    history: string, 
    nodes: SingularityNode[]
): Promise<{ text: string, actions?: AIAction[] }> => {
    if (!apiKey) return { text: "API Key missing." };

    const mapContext = nodes.map(n => ({ id: n.id, label: n.label, connections: n.childrenIds }));
    
    const systemPrompt = `
    You are the AI Co-Pilot for Singularity MindMap.
    Current Map State:
    ${JSON.stringify(mapContext).slice(0, 10000)}...

    User Query: "${userMessage}"

    Output Format (JSON):
    { "text": "response", "actions": [] }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: systemPrompt,
            config: { responseMimeType: 'application/json' }
        });
        
        return JSON.parse(response.text || "{}");
    } catch (e) {
        console.error("Chat Error", e);
        return { text: "I'm having trouble processing that request." };
    }
};

/**
 * Generates a "Dream" image for a node based on its label and context.
 */
export const generateDreamImage = async (
  label: string,
  parentContext: string,
  style: string
): Promise<string | null> => {
  if (!apiKey) return null;

  const prompt = `
    Generate an illustration for a mind map node.
    Subject: "${label}"
    Context/Parent Topic: "${parentContext}"
    Art Style: "${style}"
    
    Requirements:
    - Clear, iconic, and visually striking.
    - No text inside the image.
    - High contrast, suitable for a node background.
    - Square aspect ratio.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Dream Image Error:", error);
    return null;
  }
};
