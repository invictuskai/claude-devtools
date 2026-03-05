import React, { useState } from 'react';

// 工具中文简述映射
const TOOL_DESCRIPTIONS: Record<string, string> = {
  Agent: '启动子代理',
  TaskOutput: '获取任务输出',
  Bash: '执行Shell命令',
  Glob: '文件模式搜索',
  Grep: '内容搜索',
  ExitPlanMode: '退出计划模式',
  Read: '读取文件',
  Edit: '编辑文件',
  Write: '写入文件',
  NotebookEdit: '编辑Notebook',
  WebFetch: '获取网页内容',
  WebSearch: '网络搜索',
  TaskStop: '停止后台任务',
  AskUserQuestion: '向用户提问',
  Skill: '执行技能',
  EnterPlanMode: '进入计划模式',
  TaskCreate: '创建任务',
  TaskGet: '获取任务详情',
  TaskUpdate: '更新任务状态',
  TaskList: '列出所有任务',
  EnterWorktree: '创建工作树',
};

// 各顶层字段的中文说明和图标
const FIELD_META: Record<string, { desc: string; icon: string }> = {
  model: { desc: '使用的模型标识', icon: '🤖' },
  messages: { desc: '对话消息列表', icon: '💬' },
  system: { desc: '系统提示块', icon: '⚙️' },
  tools: { desc: '可用工具定义', icon: '🔧' },
  metadata: { desc: '请求元数据', icon: '🏷️' },
  max_tokens: { desc: '最大输出token数', icon: '📏' },
  thinking: { desc: '扩展思维配置', icon: '🧠' },
  stream: { desc: '是否启用流式传输', icon: '🌊' },
};

// 获取 content part 的中文描述
function getPartDesc(part: any): string {
  switch (part.type) {
    case 'text': return '文本内容';
    case 'thinking': return '思维过程';
    case 'tool_use': return `调用 ${part.name || '工具'}`;
    case 'tool_result': return part.is_error ? '工具错误结果' : '工具执行结果';
    default: return part.type || '未知类型';
  }
}

// 获取 system block 的中文描述
function getSystemBlockDesc(block: any): string {
  const text = block.text || '';
  if (text.startsWith('x-anthropic-billing')) return '计费标识头';
  if (text.length < 200) return '角色声明';
  return '完整系统指令';
}

function truncate(s: string, max: number = 80): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '...' : s;
}

// 从 messages 中解析 system-reminder 里的 skills
interface ParsedSkill {
  name: string;
  description: string;
}

function parseSkillsFromMessages(messages: any[]): ParsedSkill[] {
  const skills: ParsedSkill[] = [];
  for (const msg of messages) {
    const parts = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
    for (const part of parts) {
      if (part.type !== 'text' || !part.text) continue;
      const reminderRegex = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;
      let match;
      while ((match = reminderRegex.exec(part.text)) !== null) {
        const block = match[1];
        if (!block.includes('skills are available') && !block.includes('Skill tool')) continue;
        const lines = block.split('\n');
        let currentName = '';
        let currentDesc = '';
        for (const line of lines) {
          const skillMatch = line.match(/^\s*-\s+([\w:.-]+(?:\/[\w:.-]+)*)\s*[:：]\s*(.*)$/);
          if (skillMatch) {
            if (currentName) {
              skills.push({ name: currentName, description: currentDesc.trim() });
            }
            currentName = skillMatch[1];
            currentDesc = skillMatch[2];
          } else if (currentName && line.trim() && !line.match(/^\s*-\s+[\w:.-]/)) {
            currentDesc += ' ' + line.trim();
          }
        }
        if (currentName) {
          skills.push({ name: currentName, description: currentDesc.trim() });
        }
      }
    }
  }
  return skills;
}

// 从文本中移除含 skills 的 system-reminder 块
function stripSkillsReminder(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, (match) => {
    if (match.includes('skills are available') || match.includes('Skill tool')) {
      return '[已提取到 skills 模块]';
    }
    return match;
  });
}

// 可折叠详情组件
const Collapsible: React.FC<{ title: string; preview?: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, preview, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#334155] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#1a2237] hover:bg-[#1e293b] transition-colors text-left"
      >
        <span className="text-xs font-medium text-slate-300">{title}</span>
        <div className="flex items-center gap-2">
          {preview && !open && <span className="text-xs text-slate-400 mono max-w-[300px] truncate">{preview}</span>}
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="p-3 border-t border-[#1e293b] bg-[#111827]">{children}</div>}
    </div>
  );
};

// 模块区块（横线分隔，支持折叠）
const Section: React.FC<{ fieldKey: string; desc: string; icon: string; count?: number; collapsible?: boolean; defaultOpen?: boolean; children: React.ReactNode }> = ({ fieldKey, desc, icon, count, collapsible = false, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#1e293b] pb-4 mb-4 last:border-b-0">
      <div
        className={`flex items-center gap-2 ${collapsible ? 'cursor-pointer select-none hover:bg-[#1a2237] rounded-lg px-1 py-1 -mx-1 transition-colors' : 'mb-2'}`}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-slate-200 mono">{fieldKey}</h3>
        <span className="text-xs text-slate-400">{desc}</span>
        {count !== undefined && <span className="text-xs px-1.5 py-0.5 rounded bg-[#1e293b] text-slate-300 font-medium">{count}</span>}
        {collapsible && (
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ml-auto ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      {(!collapsible || open) && <div className={`pl-7 ${collapsible ? 'mt-2' : ''}`}>{children}</div>}
    </div>
  );
};
// 简单值渲染
const SimpleValue: React.FC<{ value: any; color?: string }> = ({ value, color = 'text-slate-300' }) => (
  <span className={`text-sm font-bold mono ${color}`}>{typeof value === 'boolean' ? (value ? 'true（启用）' : 'false（关闭）') : typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
);

// 渲染任意字段
function renderField(key: string, value: any, messages: any[], parsedSkills: ParsedSkill[]): React.ReactNode {
  const meta = FIELD_META[key] || { desc: '', icon: '📎' };

  // 简单标量值
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return (
      <Section key={key} fieldKey={key} desc={meta.desc} icon={meta.icon}>
        <SimpleValue value={value} color="text-violet-400" />
      </Section>
    );
  }
  if (typeof value === 'number') {
    return (
      <Section key={key} fieldKey={key} desc={meta.desc} icon={meta.icon}>
        <SimpleValue value={value} color="text-amber-400" />
      </Section>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <Section key={key} fieldKey={key} desc={meta.desc} icon={meta.icon}>
        <SimpleValue value={value} color={value ? 'text-emerald-400' : 'text-slate-500'} />
      </Section>
    );
  }

  // thinking 对象
  if (key === 'thinking' && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <Section key={key} fieldKey={key} desc={meta.desc} icon={meta.icon}>
        <div className="space-y-1">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 mono w-20">{k}:</span>
              <span className="text-sm font-semibold text-pink-400 mono">{typeof v === 'number' ? (v as number).toLocaleString() : String(v)}</span>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  // metadata 对象
  if (key === 'metadata' && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <Section key={key} fieldKey={key} desc={meta.desc} icon={meta.icon}>
        <div className="space-y-1">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="flex items-start gap-2">
              <span className="text-xs text-slate-400 mono shrink-0">{k}:</span>
              <span className="text-xs text-slate-300 mono break-all">{String(v)}</span>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  // messages 数组 → 拆分为 Skills 列表 + 对话记录
  if (key === 'messages' && Array.isArray(value)) {
    // 将 messages 配对为对话轮次（user + assistant 为一组）
    const conversations: { user: any; assistant: any }[] = [];
    for (let i = 0; i < value.length; i++) {
      const msg = value[i];
      if (msg.role === 'user') {
        const next = i + 1 < value.length && value[i + 1].role === 'assistant' ? value[i + 1] : null;
        conversations.push({ user: msg, assistant: next });
        if (next) i++; // 跳过已配对的 assistant
      } else if (msg.role === 'assistant' && (conversations.length === 0 || conversations[conversations.length - 1].assistant !== null)) {
        // 独立的 assistant 消息（无配对 user）
        conversations.push({ user: null, assistant: msg });
      }
    }

    // 提取 user content 中的可见部分（剔除 skills 声明）
    const getUserVisibleParts = (msg: any) => {
      const rawParts: any[] = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
      return rawParts.map(part => {
        if (part.type === 'text') {
          const content = parsedSkills.length > 0 ? stripSkillsReminder(part.text || '') : (part.text || '');
          const stripped = content.replace(/\[已提取到 skills 模块\]/g, '').trim();
          if (!stripped) return null;
          return { ...part, _content: content };
        }
        if (part.type === 'tool_result') {
          const content = typeof part.content === 'string'
            ? part.content
            : Array.isArray(part.content)
              ? part.content.map((b: any) => b.text || '').join('\n')
              : JSON.stringify(part.content, null, 2);
          return { ...part, _content: content };
        }
        if (part.type === 'tool_use') {
          return { ...part, _content: JSON.stringify(part.input || {}, null, 2) };
        }
        return { ...part, _content: '' };
      }).filter(Boolean) as any[];
    };

    // 提取 assistant content
    const getAssistantParts = (msg: any) => {
      const rawParts: any[] = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
      return rawParts.map(part => {
        let content = '';
        if (part.type === 'text') content = part.text || '';
        else if (part.type === 'thinking') content = part.thinking || '';
        else if (part.type === 'tool_use') content = JSON.stringify(part.input || {}, null, 2);
        else if (part.type === 'tool_result') content = typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2);
        return { ...part, _content: content };
      });
    };

    // 获取用户实际输入的简短预览
    const getUserPreview = (parts: any[]): string => {
      for (const p of parts) {
        if (p.type === 'text' && p._content) {
          // 取最后一段非 system-reminder 文本
          const lines = p._content.split('\n').filter((l: string) => l.trim() && !l.includes('<system-reminder>') && !l.includes('</system-reminder>'));
          const last = lines[lines.length - 1] || '';
          if (last.length < 200) return last;
          return truncate(last, 100);
        }
      }
      return '';
    };

    return (
      <>
        {/* Skills 列表（独立模块） */}
        {parsedSkills.length > 0 && (
          <Section fieldKey="skills" desc="解析出的技能列表" icon="🚀" count={parsedSkills.length} collapsible={true} defaultOpen={false}>
            <div className="divide-y divide-[#1e293b]">
              {parsedSkills.map((skill, idx) => (
                <div key={idx} className="flex items-start gap-3 py-2 hover:bg-[#1a2237] rounded transition-colors">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-950/40 text-indigo-400 font-medium shrink-0 mt-0.5">{idx + 1}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-indigo-400 mono">{skill.name}</span>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{skill.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 对话记录（独立模块） */}
        <Section fieldKey="对话记录" desc="user/assistant 配对对话" icon="💬" count={conversations.length} collapsible={true} defaultOpen={false}>
          <div className="space-y-3">
            {conversations.map((conv, convIdx) => {
              const userParts = conv.user ? getUserVisibleParts(conv.user) : [];
              const assistantParts = conv.assistant ? getAssistantParts(conv.assistant) : [];
              const userPreview = getUserPreview(userParts);

              return (
                <Collapsible
                  key={convIdx}
                  title={`第 ${convIdx + 1} 轮对话`}
                  preview={userPreview ? truncate(userPreview, 80) : ''}
                >
                  <div className="space-y-3">
                    {/* User 部分 */}
                    {conv.user && userParts.length > 0 && (
                      <div className="border-l-2 border-emerald-600 pl-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs">👤</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-950/40 text-emerald-400">user</span>
                          <span className="text-xs text-slate-400">{userParts.length} 个内容块</span>
                        </div>
                        <div className="space-y-1">
                          {userParts.map((part: any, pIdx: number) => (
                            <Collapsible
                              key={pIdx}
                              title={`${pIdx + 1}. ${part.type}${part.cache_control ? ' [cached]' : ''}`}
                              preview={truncate((part._content || '').replace(/\n/g, ' '), 60)}
                            >
                              <pre className="text-xs mono text-slate-200 bg-[#0a0e1a] rounded-lg p-2 max-h-96 overflow-auto whitespace-pre-wrap break-words leading-relaxed">
                                {part._content}
                              </pre>
                            </Collapsible>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Assistant 部分 */}
                    {conv.assistant && assistantParts.length > 0 && (
                      <div className="border-l-2 border-violet-600 pl-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs">🤖</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-950/40 text-violet-400">assistant</span>
                          <span className="text-xs text-slate-400">{assistantParts.length} 个内容块</span>
                        </div>
                        <div className="space-y-1">
                          {assistantParts.map((part: any, pIdx: number) => {
                            const typeBadgeColor: Record<string, string> = {
                              text: 'bg-slate-800 text-slate-400',
                              thinking: 'bg-pink-950/40 text-pink-400',
                              tool_use: 'bg-orange-950/40 text-orange-400',
                              tool_result: 'bg-teal-950/40 text-teal-400',
                            };
                            return (
                              <Collapsible
                                key={pIdx}
                                title={`${pIdx + 1}. ${part.type}${part.name ? ` (${part.name})` : ''}${part.cache_control ? ' [cached]' : ''}`}
                                preview={truncate((part._content || '').replace(/\n/g, ' '), 60)}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadgeColor[part.type] || 'bg-slate-800 text-slate-400'}`}>{part.type}</span>
                                    <span className="text-xs text-slate-400">{getPartDesc(part)}</span>
                                  </div>
                                  {part._content && (
                                    <pre className="text-xs mono text-slate-200 bg-[#0a0e1a] rounded-lg p-2 max-h-96 overflow-auto whitespace-pre-wrap break-words leading-relaxed">
                                      {part._content}
                                    </pre>
                                  )}
                                </div>
                              </Collapsible>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </Section>
      </>
    );
  }

  // system 数组
  if (key === 'system' && Array.isArray(value)) {
    return (
      <Section key={key} fieldKey={key} desc={meta.desc} icon={meta.icon} count={value.length} collapsible={true} defaultOpen={false}>
        <div className="space-y-2">
          {value.map((block: any, idx: number) => {
            const desc = getSystemBlockDesc(block);
            const hasCache = !!block.cache_control;
            return (
              <Collapsible key={idx} title={`📄 ${idx + 1} ${desc}`} preview={truncate(block.text || '', 100)}>
                <div className="space-y-2">
                  {hasCache && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950/40 text-blue-400 font-medium">
                      cache: {block.cache_control.type} / {block.cache_control.ttl || 'default'}
                    </span>
                  )}
                  <pre className="text-xs mono text-slate-200 bg-[#0a0e1a] rounded-lg p-3 max-h-64 overflow-auto whitespace-pre-wrap break-words leading-relaxed">
                    {block.text || ''}
                  </pre>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </Section>
    );
  }

  // tools 数组
  if (key === 'tools' && Array.isArray(value)) {
    return (
      <Section key={key} fieldKey={key} desc={meta.desc} icon={meta.icon} count={value.length} collapsible={true} defaultOpen={false}>
        <div className="space-y-1">
          {value.map((tool: any, idx: number) => {
            const name = tool.name || '未知';
            const cnDesc = TOOL_DESCRIPTIONS[name] || '自定义工具';
            const requiredFields = tool.input_schema?.required || [];
            const propCount = Object.keys(tool.input_schema?.properties || {}).length;
            return (
              <Collapsible key={idx} title={`${idx + 1}. ${name}`} preview={cnDesc}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-950/40 text-orange-400 font-medium">{cnDesc}</span>
                    <span className="text-xs text-slate-400">{propCount} 个参数</span>
                    {requiredFields.length > 0 && <span className="text-xs text-slate-400">必填: {requiredFields.join(', ')}</span>}
                  </div>
                  <pre className="text-xs mono text-slate-300 bg-[#0a0e1a] rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap leading-relaxed">
                    {tool.description || ''}
                  </pre>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </Section>
    );
  }

  // 其他未知对象/数组字段
  return (
    <Section key={key} fieldKey={key} desc={meta.desc || '其他字段'} icon={meta.icon}>
      <pre className="text-xs mono text-slate-200 bg-[#0a0e1a] rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    </Section>
  );
}

interface RequestInspectorProps {
  data: any;
}

const RequestInspector: React.FC<RequestInspectorProps> = ({ data }) => {
  if (!data) return null;

  const messages: any[] = data.messages || [];
  const parsedSkills = parseSkillsFromMessages(messages);

  // 严格按 JSON 键顺序渲染
  const keys = Object.keys(data);

  return (
    <div>
      {keys.map(key => renderField(key, data[key], messages, parsedSkills))}
    </div>
  );
};

export default RequestInspector;
