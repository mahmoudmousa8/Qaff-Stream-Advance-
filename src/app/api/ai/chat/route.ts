import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-helper'

// Local helper to execute tools on behalf of the AI agent
async function executeTool(name: string, args: any, origin: string, cookieHeader: string): Promise<any> {
  console.log(`[AI Tool Exec] Running ${name} with args:`, JSON.stringify(args))
  try {
    switch (name) {
      case 'getSlotsStatus': {
        const slots = await db.streamSlot.findMany({
          orderBy: { slotIndex: 'asc' }
        })
        return {
          slots: slots.map(s => ({
            slotIndex: s.slotIndex,
            channelName: s.channelName,
            status: s.status,
            inputType: s.inputType,
            filePath: s.filePath,
            schedStart: s.schedStart,
            schedStop: s.schedStop,
            youtubeTitle: s.youtubeTitle,
            youtubeDescription: s.youtubeDescription,
            isScheduled: s.isScheduled,
            isRunning: s.isRunning
          }))
        }
      }
      
      case 'updateSlotConfig': {
        const { slotIndex, updates } = args
        // Call local PUT API to run all validations, overlap checks, and database updates
        const res = await fetch(`${origin}/api/slots/${slotIndex}`, {
          method: 'PUT',
          headers: {
            'Cookie': cookieHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updates)
        })
        const data = await res.json()
        if (!res.ok) {
          return { success: false, error: data.error || 'Failed to update slot' }
        }
        return { success: true, slot: data }
      }

      case 'startStream': {
        const { slotIndex } = args
        // Call local Start API
        const res = await fetch(`${origin}/api/slots/${slotIndex}/start`, {
          method: 'POST',
          headers: {
            'Cookie': cookieHeader
          }
        })
        const data = await res.json()
        if (!res.ok) {
          return { success: false, error: data.error || 'Failed to start stream' }
        }
        return { success: true, message: data.message || 'Stream started' }
      }

      case 'stopStream': {
        const { slotIndex } = args
        // Call local Stop API
        const res = await fetch(`${origin}/api/slots/${slotIndex}/stop`, {
          method: 'POST',
          headers: {
            'Cookie': cookieHeader
          }
        })
        const data = await res.json()
        if (!res.ok) {
          return { success: false, error: data.error || 'Failed to stop stream' }
        }
        return { success: true, message: data.message || 'Stream stopped' }
      }

      case 'getSystemLogs': {
        const limit = args.limit || 20
        const logs = await db.systemLog.findMany({
          orderBy: { timestamp: 'desc' },
          take: limit
        })
        return {
          logs: logs.map(l => ({
            timestamp: l.timestamp,
            message: l.message
          }))
        }
      }

      case 'getYouTubeChannels': {
        const channels = await db.youtubeChannel.findMany({
          orderBy: { createdAt: 'desc' }
        })
        return {
          channels: channels.map(c => ({
            id: c.id,
            channelId: c.channelId,
            name: c.name,
            channelTitle: c.channelTitle,
            expiryDate: c.expiryDate
          }))
        }
      }

      case 'applyBulkAction': {
        const { actionType } = args
        let bulkAction = ''
        if (actionType === 'file_only_all') bulkAction = 'setFileOnlyAll'
        else if (actionType === 'closest_30_all') bulkAction = 'setClosest30m24mAll'
        else if (actionType === 'closest_1h_all') bulkAction = 'setClosestHour50mAll'
        else if (actionType === 'closest_2h_all') bulkAction = 'setClosest2h110mAll'
        else {
          return { success: false, error: `Invalid bulk action: ${actionType}` }
        }

        const res = await fetch(`${origin}/api/slots/bulk`, {
          method: 'POST',
          headers: {
            'Cookie': cookieHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: bulkAction, locale: 'ar' })
        })
        const data = await res.json()
        if (!res.ok) {
          return { success: false, error: data.error || 'Failed to apply bulk action' }
        }
        return { success: true, message: data.message }
      }

      case 'navigateUI': {
        return { success: true, message: `Will navigate client UI to target: ${args.target}` }
      }

      default:
        return { error: `Function ${name} not found` }
    }
  } catch (err: any) {
    console.error(`Error executing tool ${name}:`, err)
    return { success: false, error: err.message || 'Internal execution error' }
  }
}

const AGENT_ROUTER_MODELS = [
  'glm-5.1',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-6'
]

function isAgentRouterModel(model: string): boolean {
  const clean = model.startsWith('models/') ? model.replace('models/', '') : model
  return AGENT_ROUTER_MODELS.includes(clean)
}

function convertSchemaToLowerCaseTypes(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema
  
  const result = Array.isArray(schema) ? [] : {} as any
  
  for (const key in schema) {
    if (Object.prototype.hasOwnProperty.call(schema, key)) {
      const val = schema[key]
      if (key === 'type' && typeof val === 'string') {
        result[key] = val.toLowerCase()
      } else if (typeof val === 'object' && val !== null) {
        result[key] = convertSchemaToLowerCaseTypes(val)
      } else {
        result[key] = val
      }
    }
  }
  return result
}

function geminiToOpenAIMessages(messages: any[]): any[] {
  const openAIMessages: any[] = []
  let toolCallIdCounter = 0
  const pendingToolCalls: { name: string; id: string }[] = []
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const role = msg.role
    const parts = msg.parts || []
    
    if (role === 'user') {
      const text = parts.find((p: any) => p.text)?.text || msg.text || ''
      openAIMessages.push({
        role: 'user',
        content: text
      })
    } else if (role === 'model') {
      const text = parts.find((p: any) => p.text)?.text || ''
      const functionCalls = parts.filter((p: any) => p.functionCall)
      
      if (functionCalls.length > 0) {
        const tool_calls = functionCalls.map((fc: any) => {
          const id = `call_${toolCallIdCounter++}`
          pendingToolCalls.push({ name: fc.functionCall.name, id })
          return {
            id,
            type: 'function',
            function: {
              name: fc.functionCall.name,
              arguments: JSON.stringify(fc.functionCall.args || {})
            }
          }
        })
        
        openAIMessages.push({
          role: 'assistant',
          content: text || null,
          tool_calls
        })
      } else {
        openAIMessages.push({
          role: 'assistant',
          content: text
        })
      }
    } else if (role === 'function') {
      const responses = parts.filter((p: any) => p.functionResponse)
      
      for (const resp of responses) {
        const { name, response } = resp.functionResponse
        
        let matchedId = `call_unknown_${toolCallIdCounter++}`
        const matchIdx = pendingToolCalls.findIndex(tc => tc.name === name)
        if (matchIdx !== -1) {
          matchedId = pendingToolCalls[matchIdx].id
          pendingToolCalls.splice(matchIdx, 1)
        }
        
        openAIMessages.push({
          role: 'tool',
          tool_call_id: matchedId,
          name: name,
          content: JSON.stringify(response || {})
        })
      }
    }
  }
  
  return openAIMessages
}

function openAIToGeminiParts(message: any): any[] {
  const parts: any[] = []
  if (message.content) {
    parts.push({ text: message.content })
  }
  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let args = {}
      try {
        args = JSON.parse(tc.function.arguments || '{}')
      } catch (e) {
        console.error('Failed to parse tool call arguments:', tc.function.arguments, e)
      }
      parts.push({
        functionCall: {
          name: tc.function.name,
          args: args
        }
      })
    }
  }
  return parts
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { apiKey, provider, model = 'gemini-2.5-flash', messages } = await request.json()
    const cleanModel = model.startsWith('models/') ? model.replace('models/', '') : model
    
    let activeProvider = provider
    if (!activeProvider) {
      if (isAgentRouterModel(cleanModel)) {
        activeProvider = 'agentrouter'
      } else if (cleanModel.includes('/') && !model.startsWith('models/')) {
        activeProvider = 'openrouter'
      } else {
        activeProvider = 'gemini'
      }
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return NextResponse.json({ error: 'API Key is required' }, { status: 400 })
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages history is required' }, { status: 400 })
    }

    const cookieHeader = request.headers.get('cookie') || ''
    const origin = request.nextUrl.origin

    const systemInstructionText = `You are the AI Assistant for Qaff Stream (كاف ستريم), a premium live streaming management panel. Your role is to help users manage their stream slots, generate engaging titles and descriptions for their broadcasts, and guide them on how to link/authorize YouTube channels.
You have tools available to control the streaming panel on behalf of the user. You can read slot configurations, start or stop streaming, view system logs, list linked YouTube channels, apply bulk configuration actions, and navigate the user interface.

Whenever the user asks you to do something that corresponds to a tool (like listing slots, starting/stopping streams, updating title/description/video file/thumbnail file paths, viewing logs, showing channels, running bulk scheduling, or navigating to tabs), you MUST call the appropriate function tool.
After a tool is executed, summarize the results to the user in a friendly, conversational tone (in Arabic if the user speaks Arabic).

If the user asks you to generate titles, descriptions, or ideas for their videos/streams:
1. Provide a friendly conversational explanation of your suggestions.
2. In addition, you MUST output a single valid JSON block containing the generated titles and descriptions. The JSON block should strictly follow this format:
{
  "titles": ["Title 1", "Title 2"],
  "descriptions": ["Description 1", "Description 2"]
}
Ensure that the JSON is valid and easy for the system to parse.`

    const toolsConfig = [{
      functionDeclarations: [
        {
          name: 'getSlotsStatus',
          description: 'احصل على حالة وإعدادات وتفاصيل جميع القنوات والمسارات (slots) في النظام بما في ذلك الحالة والجدولة والعناوين ومسارات الملفات.'
        },
        {
          name: 'updateSlotConfig',
          description: 'تحديث إعدادات قناة معينة (slot index). يمكنك تحديث العناوين، الأوصاف، مسار الفيديو، الصورة المصغرة، أوقات البدء والإيقاف، وتفعيل الجدولة أو تعطيلها.',
          parameters: {
            type: 'OBJECT',
            properties: {
              slotIndex: { type: 'INTEGER', description: 'رقم القناة أو المسار (0-indexed)' },
              updates: {
                type: 'OBJECT',
                properties: {
                  channelName: { type: 'STRING', description: 'اسم القناة في اللوحة' },
                  inputType: { type: 'STRING', description: 'نوع البث: "file" (فيديو مسجل) أو "live" (إعادة بث)' },
                  filePath: { type: 'STRING', description: 'مسار ملف الفيديو أو مجلد الفيديوهات' },
                  youtubeThumbnailPath: { type: 'STRING', description: 'مسار الصورة المصغرة أو مجلد الصور المصغرة' },
                  youtubeTitle: { type: 'STRING', description: 'عنوان البث على يوتيوب' },
                  youtubeDescription: { type: 'STRING', description: 'وصف البث على يوتيوب' },
                  schedStart: { type: 'STRING', description: 'وقت البدء (تنسيق MM-DD HH:MM)' },
                  schedStop: { type: 'STRING', description: 'وقت الإيقاف (تنسيق MM-DD HH:MM أو DUR HH:MM)' },
                  isScheduled: { type: 'BOOLEAN', description: 'تفعيل الجدولة تلقائياً' }
                }
              }
            },
            required: ['slotIndex', 'updates']
          }
        },
        {
          name: 'startStream',
          description: 'بدء تشغيل بث قناة معينة (slot index) فوراً.',
          parameters: {
            type: 'OBJECT',
            properties: {
              slotIndex: { type: 'INTEGER', description: 'رقم المسار (0-indexed)' }
            },
            required: ['slotIndex']
          }
        },
        {
          name: 'stopStream',
          description: 'إيقاف تشغيل بث قناة معينة (slot index) فوراً.',
          parameters: {
            type: 'OBJECT',
            properties: {
              slotIndex: { type: 'INTEGER', description: 'رقم المسار (0-indexed)' }
            },
            required: ['slotIndex']
          }
        },
        {
          name: 'getSystemLogs',
          description: 'عرض آخر سجلات وأحداث النظام لمراقبة العمليات أو التحقق من أسباب الفشل.',
          parameters: {
            type: 'OBJECT',
            properties: {
              limit: { type: 'INTEGER', description: 'عدد السجلات المطلوبة (الافتراضي 20)' }
            }
          }
        },
        {
          name: 'getYouTubeChannels',
          description: 'الحصول على قائمة قنوات يوتيوب المربوطة والمصرحة في النظام لمعرفة أسمائها ومعرفاتها.'
        },
        {
          name: 'applyBulkAction',
          description: 'تطبيق إعداد أو إجراء جماعي على جميع القنوات غير الباثة دفعة واحدة.',
          parameters: {
            type: 'OBJECT',
            properties: {
              actionType: { 
                type: 'STRING', 
                description: 'نوع الإجراء الجماعي: "file_only_all" (بث مسجل فقط للكل)، "closest_30_all" (أقرب 30 دقيقة للكل)، "closest_1h_all" (أقرب ساعة للكل)، "closest_2h_all" (أقرب ساعتين للكل)' 
              }
            },
            required: ['actionType']
          }
        },
        {
          name: 'navigateUI',
          description: 'توجيه واجهة المستخدم إلى صفحة أو تبويب معين أو فتح نافذة ربط قناة يوتيوب جديدة.',
          parameters: {
            type: 'OBJECT',
            properties: {
              target: { 
                type: 'STRING', 
                description: 'الهدف: "slots" (شاشة اللوحة الرئيسية)، "channels" (إدارة القنوات)، "logs" (سجلات النظام)، "add_channel" (ربط قناة يوتيوب جديدة في المتصفح)' 
              }
            },
            required: ['target']
          }
        }
      ]
    }]

    let loopCount = 0
    let clientAction: any = null
    const maxLoops = 5
    let currentHistory = [...messages]

    while (loopCount < maxLoops) {
      let data: any
      let parts: any[] = []

      const isOpenAICompatible = activeProvider === 'agentrouter' || activeProvider === 'openrouter' || activeProvider === 'nvidia'

      if (isOpenAICompatible) {
        const openAITools = toolsConfig[0].functionDeclarations.map((fd: any) => {
          const tool: any = {
            type: 'function',
            function: {
              name: fd.name,
              description: fd.description
            }
          }
          if (fd.parameters) {
            tool.function.parameters = convertSchemaToLowerCaseTypes(fd.parameters)
          }
          return tool
        })

        const openAIMessages = geminiToOpenAIMessages(currentHistory)

        let endpoint = ''
        if (activeProvider === 'agentrouter') {
          endpoint = 'https://agentrouter.org/v1/chat/completions'
        } else if (activeProvider === 'openrouter') {
          endpoint = 'https://openrouter.ai/api/v1/chat/completions'
        } else if (activeProvider === 'nvidia') {
          endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions'
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }

        if (activeProvider === 'openrouter') {
          headers['HTTP-Referer'] = 'https://qaff.stream'
          headers['X-Title'] = 'Qaff Stream'
        }

        const requestPayload: any = {
          model: cleanModel,
          messages: [
            { role: 'system', content: systemInstructionText },
            ...openAIMessages
          ],
          tools: openAITools,
          tool_choice: 'auto'
        }

        if (activeProvider === 'nvidia') {
          requestPayload.extra_body = {
            chat_template_kwargs: {
              enable_thinking: true,
              clear_thinking: false
            }
          }
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25000)

        let response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestPayload),
            signal: controller.signal
          })
        } catch (fetchErr: any) {
          if (fetchErr.name === 'AbortError') {
            console.error(`${activeProvider} request timed out after 25s`)
            return NextResponse.json(
              { error: `AI request timed out after 25 seconds. Please try again or switch model.` },
              { status: 408 }
            )
          }
          throw fetchErr
        } finally {
          clearTimeout(timeoutId)
        }

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`${activeProvider} API Error Response:`, errorText)
          return NextResponse.json(
            { error: `${activeProvider} API returned status ${response.status}: ${errorText}` },
            { status: response.status }
          )
        }

        data = await response.json()
        const message = data.choices?.[0]?.message
        if (!message) {
          throw new Error(`Empty response from ${activeProvider}`)
        }
        parts = openAIToGeminiParts(message)
      } else {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25000)

        let response;
        try {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: currentHistory.map(msg => ({
                  role: msg.role === 'user' ? 'user' : (msg.role === 'function' ? 'function' : 'model'),
                  parts: msg.parts || [{ text: msg.text || '' }]
                })),
                systemInstruction: {
                  parts: [
                    {
                      text: systemInstructionText,
                    },
                  ],
                },
                tools: toolsConfig
              }),
              signal: controller.signal
            }
          )
        } catch (fetchErr: any) {
          if (fetchErr.name === 'AbortError') {
            console.error(`Gemini request timed out after 25s`)
            return NextResponse.json(
              { error: `Gemini API request timed out after 25 seconds. Please try again or switch model.` },
              { status: 408 }
            )
          }
          throw fetchErr
        } finally {
          clearTimeout(timeoutId)
        }

        if (!response.ok) {
          const errorText = await response.text()
          console.error('Gemini API Error Response:', errorText)
          return NextResponse.json(
            { error: `Gemini API returned status ${response.status}: ${errorText}` },
            { status: response.status }
          )
        }

        data = await response.json()
        const candidate = data.candidates?.[0]
        const modelContent = candidate?.content
        parts = modelContent?.parts || []
      }

      // Find any function call request
      const functionCalls = parts.filter((p: any) => p.functionCall)

      if (functionCalls.length > 0) {
        // Append model's message containing functionCalls to currentHistory
        currentHistory.push({
          role: 'model',
          parts: parts
        })

        // Execute functions
        const functionResponseParts: any[] = []
        for (const fc of functionCalls) {
          const { name, args } = fc.functionCall
          if (name === 'navigateUI') {
            clientAction = args
          }

          const result = await executeTool(name, args, origin, cookieHeader)

          functionResponseParts.push({
            functionResponse: {
              name,
              response: { output: result }
            }
          })
        }

        // Append function response to history
        currentHistory.push({
          role: 'function',
          parts: functionResponseParts
        })

        loopCount++
      } else {
        // No function calls, return final text reply
        const replyText = parts[0]?.text || ''
        return NextResponse.json({
          reply: replyText,
          history: currentHistory,
          clientAction
        })
      }
    }

    return NextResponse.json({ error: 'Reached maximum tool loop iterations' }, { status: 500 })
  } catch (error: any) {
    console.error('Error in AI Chat Route:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
