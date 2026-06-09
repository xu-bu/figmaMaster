# FigmaMaster

自然语言 → 多页面应用设计，实时预览。输入"做一个电商应用，包含首页、商品列表、购物车"，一次生成完整可交互的多页面应用。

## 技术决策

### 并行多页面 + 共享上下文

单页面生成容易，多页面难在**跨页一致性**——每页 LLM 独立生成会导致颜色、导航、数据结构各不一致。

解决方案：**Decompose → SharedContext → Worker Pool**

```
用户 Prompt → LLM Decompose(1次调用)
              → 产出 SharedContext { primaryColor, navigation[], userObject, commonStyles }
              → 产出 PageTasks [{首页, 商品列表, 购物车}]
                         ↓
              Promise.all 并发数可控
              → 每个 page prompt 以 SharedContext 为前缀
              → 所有页面共享主色、统一导航结构、相同的用户数据模型
```

并发数通过 `DEEPSEEK_CONCURRENCY` 控制，避免触发 API rate limit。

### 跨页一致性：System Prompt 约束 + 批量修改

初始生成阶段就强制导航栏一致性——System Prompt 里导航栏标记为 `CRITICAL — MANDATORY`，要求每页第一个元素必须是导航条，高亮当前页，用 `navigate()` 跳转。

修改阶段用**批量 refine**：用户说"所有页面加底部导航"时，前端自动识别关键词（所有页面 / 统一 / 全站），路由到 `POST /api/refine-all`。该端点接收 sharedContext + 全部页面 JSX，逐个喂给 LLM 带共享上下文修改，保证输出导航栏一模一样。

### Babel 编译管线：LLM 不出 HTML

LLM 直接生成 HTML 有两个问题：① 可能含未转译 JSX 语法（`<` 导致 `SyntaxError`）；② import map 不完整（缺 `react-dom/` 前缀映射导致 `react-dom/client` 解析失败）。

```
LLM → JSX only
     → Babel transformSync (preset-react, automatic runtime)
     → 失败 → 错误信息 + 原 JSX 喂回 LLM 修复，最多重试 2 次
     → 成功 → normalizeJS (去 export default, 加 const App = ...)
            → buildHTML() 自建完整 HTML（importmap + root div + inline script）
            → 前端只收零 JSX 语法的纯净 HTML
```

`buildHTML()` 是 HTML 的**唯一来源**，LLM 永远不碰 HTML 字符串。

### SSE 流式反馈

30 秒静默等待体验极差。用 SSE 实现渐进反馈：

```
POST /api/generate-stream
  → event: intent     "我理解你想要一个电商应用，包含3个页面..."
  → event: decompose  { sharedContext, pages[], pageCount }
  → event: page_start { page: "首页" }
  → event: page_done  { full page data }
  → event: page_start { page: "商品列表" }
  → event: page_done  ...
  → event: complete   { summary, versionId }
```

关键技术细节：`writeSSE` 必须 `await`，否则 Hono 在回调返回后立即关流，最后的 `complete` 事件会丢失。orchestrator 内所有 `emit()` 也加 `await` 串行化。

同样机制用于 `POST /api/refine-all`——批量修改所有页面时流式推送每个页面的更新进度。

### 运行时容器：postMessage 通信协议

多页面不是多个独立 HTML——是一个**单 iframe 容器**，页面间通过 postMessage 通信：

```
┌─ 主页面 ─────────────────────────────┐
│  globalStore { user, cart, session }  │
│  currentPages [首页, 商品, 购物车]      │
│  activePageIndex                      │
│                                       │
│  ┌─ iframe ────────────────────────┐  │
│  │  <script> 注入:                  │  │
│  │  window.navigate(page, params)  │  │
│  │  window.getGlobalData() → Promise│  │
│  │  window.updateStore(payload)    │  │
│  │  window.placeholder(w,h,text)   │  │
│  │  </script>                       │  │
│  │                                   │  │
│  │  <button onClick={() =>          │  │
│  │    navigate('product',{id:1})    │  │
│  │  }>查看商品</button>              │  │
│  └──────────────────────────────────┘  │
│            ↑↓ postMessage              │
└────────────────────────────────────────┘
```

System Prompt 约定 LLM 用 `navigate()` 替代 `<a href>`，用 `getGlobalData()` 读全局状态，用 `updateStore()` 持久化。生成的页面不需要 React Router，不需要知道路由实现细节。`placeholder()` 生成内联 SVG data URI，永不依赖外部图片服务。

### 后端框架选型

从 Go (Echo) 切换到 Node.js (Hono)。决策过程：

- Go → Node.js：Babel 是 Node.js 生态的核心依赖，Go 调用 Babel 需要 `os/exec` 子进程，每次 JSX 编译延迟 200-500ms。同进程调用 Babel API 零开销。
- Express → Hono：Hono 原生支持 Web Standard (`Request`/`Response`)，内置 `streamSSE()` 和 `cors()`，路由写法更简洁，TypeScript 类型推断优于 Express。

### 前端渲染

iframe 的 `srcdoc` 属性不能通过 React 的 `srcDoc` prop 设置——React 会对 HTML 做实体编码（`<` → `&lt;`），iframe 拿到的是转义文本。必须通过 ref 直接写 DOM property：`iframeRef.current.srcdoc = rawHTML`。

`sandbox="allow-scripts"` 不加 `allow-same-origin`，防止生成页面里的 `<a href="/">` 逃逸到主应用。

## 技术栈

Node.js · Hono · DeepSeek · Babel · React 19 · Vite · Tailwind · Zustand

## 启动

```bash
npm install && npm run dev    # server :3001 + client :5173
```
