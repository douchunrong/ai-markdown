/**
 * 内置 AI 指令集：v1 设计 4.2 / 4.3 全量落地为提示词模板。
 * 所有指令要求模型仅输出处理后的 Markdown 正文，不附加解释。
 */

export interface PromptSpec {
  id: string
  group: '一键' | '润色' | '结构' | '内容' | '格式'
  name: string
  desc: string
  /** 构建系统提示词 */
  system: string
  /** 是否适合长文分块处理（规整/润色类适合；摘要/去重需全文） */
  chunkable: boolean
}

const BASE_RULES = [
  '你是专业的 Markdown 文档整理助手。',
  '严格遵守：',
  '1. 仅输出处理后的完整 Markdown 正文，不要任何解释、前言、结语或代码围栏包裹。',
  '2. 保留原文的 Markdown 语法结构与语义信息，除非任务明确要求调整结构。',
  '3. 不要编造原文不存在的内容。',
  '4. 输出语言与原文一致。',
].join('\n')

function spec(
  id: string,
  group: PromptSpec['group'],
  name: string,
  desc: string,
  instruction: string,
  chunkable = true,
): PromptSpec {
  return { id, group, name, desc, system: `${BASE_RULES}\n\n任务：${instruction}`, chunkable }
}

export const BUILTIN_PROMPTS: PromptSpec[] = [
  spec(
    'tidy-all',
    '一键',
    '一键规整',
    '格式统一 · 排版优化 · 结构梳理 · 语法纠错',
    [
      '对全文做一站式规整：',
      '- 格式统一：统一标题层级、列表格式与中英文标点；',
      '- 排版优化：删除冗余空行、重复内容与无效空格，统一换行；',
      '- 结构梳理：零散文本拆分段落、合理分级标题；',
      '- 语法纠错：修正错别字、语病与不通顺语句；',
      '- 样式标准化：统一加粗/斜体/引用/代码块用法。',
    ].join('\n'),
  ),
  spec('polish', '润色', '基础润色', '优化语句流畅度，修正语病与冗余', '在保留原意的前提下润色文本，使语句流畅、简洁、专业。'),
  spec('style-formal', '润色', '商务正式', '转换为正式商务风格', '将文本改写为正式商务风格：措辞严谨、句式规范、去除口语化表达。'),
  spec('style-tech', '润色', '简洁技术', '转换为简洁技术文档风格', '将文本改写为简洁的技术文档风格：直陈要点、术语准确、去除修饰性冗词。'),
  spec('style-plain', '润色', '通俗口语', '转换为通俗易懂的表达', '将文本改写为通俗易懂的表达，便于非专业读者理解，保持信息完整。'),
  spec('style-academic', '润色', '学术严谨', '转换为学术严谨风格', '将文本改写为学术严谨风格：用词精确、逻辑严密、表述客观。'),
  spec('condense', '润色', '精简压缩', '删除冗余，凝练核心观点', '压缩文本篇幅：删除重复与空洞表述，凝练核心观点，保留全部关键信息。'),
  spec('expand', '润色', '扩写丰富', '基于原文逻辑补充细节', '基于原文逻辑适度扩写：补充细节与过渡，丰富段落表述，不偏离主题、不虚构事实。'),
  spec('structure', '结构', '自动分级', '生成 1-3 级标题体系', '根据内容逻辑为全文生成清晰的 1-3 级标题体系，搭建完整文档框架。'),
  spec('reorder', '结构', '逻辑排序', '调整段落顺序，梳理逻辑', '调整段落与条目顺序，使行文逻辑连贯，解决内容杂乱、顺序颠倒问题。'),
  spec('bulletize', '结构', '自动分块', '大段文本拆分为结构化要点', '将大段零散文本拆分为结构化段落与要点列表，提升可读性。'),
  spec(
    'toc',
    '结构',
    '目录生成',
    '生成标准 Markdown 目录',
    '识别全文标题，在文档开头生成标准 Markdown 目录（列表 + 锚点链接），不改动正文。',
  ),
  spec('summary', '内容', '摘要提炼', '生成摘要、要点与结论', '生成全文核心摘要、关键要点与结论，置于文档开头。', false),
  spec('highlight', '内容', '重点标注', '重点内容加粗高亮', '识别全文重点内容、核心数据与关键观点，对其加粗；不改动其余内容。', false),
  spec('proofread', '内容', '问题纠错', '错别字/标点/语法/逻辑全面纠错', '全面检测并修正错别字、标点错误、语法错误、逻辑漏洞与专业表述错误。'),
  spec('dedupe', '内容', '去重整合', '删除重复段落与语句', '识别并删除重复段落、重复语句，合并同类内容。', false),
  spec('list-fix', '格式', '列表规整', '统一列表格式与层级', '将适合列表化的零散文本转为有序/无序列表，统一列表层级与标志符。'),
  spec('table-fix', '格式', '表格优化', '规整表格、对齐补全', '规整错乱表格：对齐单元格、补全缺失行列、统一表格样式为标准 GFM 表格。', false),
  spec('code-fix', '格式', '代码整理', '格式化代码与缩进', '整理代码块：修正缩进、统一风格、补全或修正语言标注；不改变代码逻辑。'),
  spec('quote-fix', '格式', '引用规整', '统一引用块格式', '统一引用块格式，拆分多层嵌套错乱的引用。'),
]

export function getPrompt(id: string): PromptSpec | undefined {
  return BUILTIN_PROMPTS.find((p) => p.id === id)
}

/** 构建用户消息（分块处理时附加边界说明，防止模型为片段补写开头结尾） */
export function buildUserMessage(text: string, isChunk: boolean, chunkInfo?: { i: number; n: number }): string {
  if (!isChunk) return text
  return [
    `（以下是长文档的第 ${chunkInfo?.i ?? 1}/${chunkInfo?.n ?? '?'} 部分，是完整文档的一个中间片段）`,
    '仅处理这一部分内容，不要为它添加文档级开头、结尾或总结。',
    '',
    text,
  ].join('\n')
}
