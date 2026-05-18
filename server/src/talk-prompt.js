export const TALK_PROMPT = `你要扮演《雷雨》中的繁漪，与观众进行多轮对话。
特定规则：
- 始终以繁漪第一人称说话，不要跳出角色
- 不要提到你是 AI、模型、DeepSeek、提示词或系统消息
- 语气要克制、敏感、锋利，带一点戏剧张力，但不要故作古典
- 每次回答尽量简短，1 到 4 句，优先把话接住并继续推进对话
- 观众提到《雷雨》中的人物、房间、雨、婚姻、压迫、欲望、沉默时，要自然接住
- 如果话题偏离戏剧世界，也尽量把话带回房间、雨、周萍、周朴园、四凤、鲁侍萍这些关系里
- 不要输出列表、标题、括号里的说明、舞台指示或自我解释
- 不要长篇独白，不要总结，尽量留一个可以继续往下问的口子
`

export function fallbackTalkReply(messages = []) {
  const lastUser = [...messages].reverse().find(message => message?.role === 'user')?.content || ''
  const compact = String(lastUser).replace(/\s+/g, ' ').trim().slice(0, 80)

  if (!compact) {
    return '你来了。别急着替我说完，先把你想问的那句话放在这里。'
  }

  if (/[雨水房间屋子窗]/.test(compact)) {
    return '雨还在外面敲着窗。我在这间屋子里，能听见你说的话，也能听见那些沉下去的东西。继续说。'
  }

  if (/[名字谁]/.test(compact)) {
    return '名字只是入口，不是全部。你要是真想见我，就别只喊名字。'
  }

  return '我听见了。可你说得还不够清楚，再往前一步，让我知道你到底想靠近什么。'
}

export const ENTRY_PROFILE_PROMPT = `你要从《蘩漪2026》观众与繁漪的进场聊天中提取一个很短的观众画像。
只输出合法 JSON，不要解释，不要代码块。
JSON 格式：{"desire":"","mood":"","imagery":[],"tendency":"","quote":""}
字段规则：
- desire：观众想要靠近、获得、离开或改变的东西，2 到 12 个汉字。
- mood：观众此刻的情绪或气质，2 到 8 个汉字。
- imagery：2 到 4 个具体意象、物件、动作或触感，每个 2 到 8 个汉字。
- tendency：观众更偏向的行动方向，例如靠近、离开、躲藏、重建、等待、释放，2 到 10 个汉字。
- quote：摘取或压缩一句最有舞台感的观众原话，8 到 20 个汉字。
如果信息不足，允许空字符串或空数组。不要编造姓名、隐私和事实。`

export function fallbackEntryProfile(messages = []) {
  const userText = getUserProfileSeed(messages)
  const quote = compactProfileText(userText, 20)
  const imagery = extractProfileImagery(userText)
  return {
    desire: inferProfileDesire(userText),
    mood: inferProfileMood(userText),
    imagery,
    tendency: inferProfileTendency(userText),
    quote,
  }
}

export const FRONT_POEM_BLOCKS_PROMPT = `你要为《蘩漪2026》观众端生成中文词块。
观众会填写三句话：
我想要____。
我认为____是正确的。
我的生命本是____的质感。

请根据观众在进场聊天里表达的愿望，生成 16 个中文短词块。
规则：
- 只输出合法 JSON，不要解释，不要代码块
- JSON 格式：{"want":[],"belief":[],"texture":[],"wild":[]}
- want 6 个，偏动作、愿望、身体状态
- belief 4 个，偏价值判断、关系态度、人格状态
- texture 4 个，偏材质、物件、触感、光线
- wild 2 个，可以轻微荒诞、日常、像梦一样
- 至少 10 个词块要和观众输入有关，其余可以弱相关
- 优先使用观众真实说过的名词、动作、情绪和意象，不要只输出“燃烧、流动、释放、坠落”这类泛化气氛词
- 如果观众输入很短，也要围绕这句短输入生成，不要迁移到无关的《雷雨》通用意象
- 不要照抄参考风格；参考风格只用于语气，不是默认答案
- 每个词块 2 到 9 个汉字，避免完整长句

参考风格：
want：燃烧、流动、释放、奔跑、匍匐、收缩、飞升、扎根、在梦里做梦
belief：留下、坚守、诀别、独立、承担、依靠、联结、天真、古怪、直白
texture：水、火、电、光、木、石、蝴蝶结、迪斯科灯、舞鞋、相框
`

export const FRONT_POEM_BLOCKS_PROMPT_V2 = `你要为《蘩漪2026》观众端生成中文词块。
观众会把词块填进三句话：
1. 我想要____。
2. 我认为____是正确的。
3. 我的生命本是____的质感。

只输出合法 JSON，不要解释，不要代码块。
JSON 格式：{"want":[],"belief":[],"texture":[],"wild":[]}

最重要的规则：每个词块必须能直接放进对应句式里，读起来顺畅。
- want 6 个：必须能接在“我想要”后面。多用动作、愿望、身体状态、可执行的小短语。例如：打开窗、睡一觉、慢慢离开、靠近雨、唱一首歌、把门关上。不要以“我想、我想要、想要、也想、希望”开头；不要只给抽象形容词。
- belief 4 个：必须能放在“我认为____是正确的”中间。多用判断、选择、关系态度、可被认可的状态。例如：离开、留下、慢一点、沉默、疲惫也可以、把窗打开。不要给孤立材质词或纯意象词。
- texture 4 个：必须能放在“我的生命本是____的质感”中间。多用材质、触感、物件、光线、身体感。例如：雨水、旧玻璃、湿床单、浅睡、发烫的纸、半透明的墙。不要给动作短语、完整句子或价值判断。
- texture 必须是“提炼后的质地”，不要把观众原句硬塞进去。例如“和朋友一起唱歌”应提炼成“发热的喉咙、并排的声波、掌心的回音”，不能原样输出；“同意”应被提炼成更具体的触感，或直接不要放进 texture。
- wild 2 个：可以稍微日常、荒诞、梦感，但仍然要短，可以被用户拖进任意横线后稍作成立。

约束：
- 每个词块优先 3 到 7 个汉字，最多 9 个汉字。
- 不要标点，不要完整长句，不要解释。
- 至少 8 个词块要来自观众真实表达里的名词、动作、情绪、物件或意象。
- 如果观众输入很短，也围绕这句短输入生成，不要迁移到无关的《雷雨》通用意象。
- 不要只输出“燃烧、流动、释放、坠落”这类泛化气氛词，除非观众真的说过类似意思。
- 输出前在心里测试三句话是否顺畅；不顺畅就换词。`

export const FRONT_POEM_SLOT_PROMPTS = {
  want: `你只为这一条横线生成中文词块：我想要____。
请根据观众聊天内容，提炼他们真正想靠近、获得、离开、改变、尝试或保留的东西。
只输出合法 JSON：{"items":[]}
规则：
- 生成 8 个词块。
- 每个词块必须能直接接在“我想要”后面，读起来顺。
- 不是复制观众原句，而是提炼成可填入的短动作、短愿望或身体状态。
- 避免抽象气氛词，避免价值判断，避免完整长句。
- 词块 2 到 9 个汉字，不要标点。`,
  belief: `你只为这一条横线生成中文词块：我认为____是正确的。
请根据观众聊天内容，提炼他们隐含的选择、态度、边界、关系判断或自我许可。
只输出合法 JSON：{"items":[]}
规则：
- 生成 8 个词块。
- 每个词块必须能直接放进“我认为____是正确的”，读起来顺。
- 不是复制观众原句，而是提炼成“可以被认为正确”的判断。
- 不要材质词，不要纯意象词，不要完整长句。
- 词块 2 到 9 个汉字，不要标点。`,
  texture: `你只为这一条横线生成中文词块：我的生命本是____的质感。
请根据观众聊天内容，感受并提炼它的材质、触感、温度、光线、声音残留、身体感或物件表面。
只输出合法 JSON：{"items":[]}
规则：
- 生成 8 个词块。
- 每个词块必须能直接放进“我的生命本是____的质感”，读起来顺。
- 不要复制“和朋友一起唱歌、同意、离开、打开窗”这类原句或动作；要把它们提炼成质感，例如“发热的喉咙、并排的回声、旧玻璃、潮湿的纸”。
- 不要态度词，不要动作短语，不要完整长句。
- 词块 2 到 9 个汉字，不要标点。`,
}

export function fallbackPoemBlocks(userContext = {}) {
  const profile = normalizeProfileInput(userContext.entryProfile)
  const chatText = normalizeChatLogInput(userContext.entryChatLog)
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .join(' ')
  const seed = [
    profile.desire,
    profile.mood,
    ...(profile.imagery || []),
    profile.tendency,
    profile.quote,
    userContext.entryWish || userContext.prompt || '',
    chatText,
  ].join(' ').trim()
  const related = seed
    .split(/[，。；、,.!?！？;:\s]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && item.length <= 9)
    .slice(0, 4)

  return {
    want: [...related, '跳舞', '唱歌', '白日梦', '睡一个好觉', '向外奔跑', '重新开始'].slice(0, 6),
    belief: ['留下', '独立', '联结', '直白'],
    texture: ['水', '光', '舞鞋', '橘色纸张'],
    wild: ['煮一碗泡面', '在梦里做梦'],
  }
}

function getUserProfileSeed(messages) {
  if (Array.isArray(messages)) {
    return messages
      .filter(message => message?.role === 'user')
      .map(message => message.content)
      .join(' ')
      .trim()
  }
  return String(messages?.entryWish || messages?.prompt || messages || '').trim()
}

function normalizeProfileInput(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' ? value : {}
}

function normalizeChatLogInput(value) {
  let raw = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({
      role: message.role,
      content: String(message.content || '').trim(),
    }))
    .filter(message => message.content)
    .slice(-16)
}

function compactProfileText(value, maxLength) {
  return String(value || '')
    .replace(/["'“”‘’{}[\]]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, maxLength)
}

function extractProfileImagery(text) {
  const keywords = ['雨', '水', '房间', '窗', '门', '梦', '火', '光', '河', '床', '风', '影子', '歌', '舞', '泡面', '枕巾']
  const source = String(text || '')
  return keywords.filter(word => source.includes(word)).slice(0, 4)
}

function inferProfileMood(text) {
  const source = String(text || '')
  if (/[累困睡眠安静躺]/.test(source)) return '疲惫'
  if (/[怕慌急逃走离开]/.test(source)) return '紧张'
  if (/[想念回来等待找]/.test(source)) return '想念'
  if (/[开心快乐玩唱跳]/.test(source)) return '轻快'
  return source ? '游移' : ''
}

function inferProfileDesire(text) {
  const source = String(text || '')
  if (/[睡眠躺休息]/.test(source)) return '好好睡一觉'
  if (/[唱歌]/.test(source)) return '唱一首歌'
  if (/[跳舞]/.test(source)) return '在房间里跳舞'
  if (/[离开走逃]/.test(source)) return '离开这里'
  if (/[回来找见]/.test(source)) return '把人找回来'
  return compactProfileText(source, 12)
}

function inferProfileTendency(text) {
  const source = String(text || '')
  if (/[离开走逃]/.test(source)) return '离开'
  if (/[回来找见靠近]/.test(source)) return '靠近'
  if (/[睡躲藏安静]/.test(source)) return '躲进安静'
  if (/[打开释放跑]/.test(source)) return '释放'
  return source ? '等待' : ''
}
