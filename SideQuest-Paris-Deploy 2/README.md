## DeepSeek 接入（当前推荐配置）

本地编辑项目根目录 `.env`，填入 `DEEPSEEK_API_KEY` 后保存，重启 `node server.mjs`：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=在本机填写你的密钥
DEEPSEEK_MODEL=deepseek-flash
PORT=4174
```

网页刷新后，Something changed? 选择「AI · DeepSeek」并输入「晚出发一个半小时，现在很累」。调用成功后会显示识别结果和规则调整。密钥不得提交 GitHub。创建 Key 不代表有可用余额；402 会显示余额不足。

DeepSeek 使用 Chat Completions JSON 模式并关闭思考；JSON 格式正确不等于字段可靠，因此仍经过现有 schema 和约束校验。Mock、关键词规则与 OpenAI 兼容入口保留。下文 OpenAI 配置仅适用于主动设置 AI_PROVIDER=openai。尚未验证真实 DeepSeek 调用。

# SideQuest · AI 需求理解 + 规则重规划

保留 HTML、CSS、原生 JavaScript 和原规划规则。Node.js 后端用内置 fetch 调用 OpenAI Responses API，没有第三方运行依赖。

## 启动和配置

需要 Node.js 22 或以上。在项目目录执行：

```sh
cp -n .env.example .env
```

在本机编辑 `.env`（不要把密钥发到聊天或写入前端）：

```dotenv
OPENAI_API_KEY=你的真实密钥
OPENAI_MODEL=gpt-4o-mini
PORT=4174
```

模型是配置示例，可改为账号可用且支持 Structured Outputs 的模型。

```sh
node server.mjs
# 或 npm start；不需要 npm install
```

打开 http://127.0.0.1:4174 。仅监听本机。修改环境变量后需重启。如果终端找不到 node，本机已验证的运行方式：

```sh
/Users/aix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

## 验证真实 AI

1. 生成一天行程，打开 Something changed?，选择「AI · OpenAI 大模型」。
2. 输入「我比计划晚出发一个半小时，现在很疲惫，希望少走路」。
3. 成功后查看「AI 识别 · 规则执行」、提取的迟到分钟数/体力，以及实际调整原因。
4. 终端应有 source=ai、status=applied 的 JSON 日志；也可在 OpenAI 账号的 API 使用记录中核对调用。仅 health 接口显示已配置不代表密钥有效。

真实模式不会自动切换 Mock。未配置密钥、网络失败、超时、拒绝、额度不足或无效输出均显示错误，原计划不变，可点击「使用本地关键词规则处理同一句话」。真实请求使用账号 API 额度。

当前交付环境未配置真实密钥，未验证真实 OpenAI 调用；自动测试使用注入的模拟 HTTP 响应。

## 三种模式

- AI：后端调用 OpenAI，把自然语言转成严格 JSON；程序再次校验，再交给原规则引擎。
- Mock：明确标注非真实 AI，固定返回「下雨、体力 2」，忽略输入语义，不访问 OpenAI。用于无密钥时走通浏览器→后端→校验→规则→页面的完整流程，不用于评估识别准确率。
- 关键词规则：原来的浏览器内规则，不依赖后端或 API。Energy 按钮和首次生成行程也仍由规则执行。

模型只理解需求，不能直接修改时间表、预算、必去标记和已完成记录。无法处理或有歧义时先提示补充。规则继续负责时间、费用、必去地点与已完成活动；不能安排的必去项目进入待安排清单，预算冲突继续明确展示，并不保证所有约束都有可行解。

地点、费用、交通和停留时间仍是模拟数据；没有实时地图、天气、排队或营业时间接口。保存最近计划、撤销和页面设计保留。单文件 SideQuest.html 只适合本地规则演示；AI/Mock 请通过 Node 服务打开。

## 安全与基础日志

密钥只由后端环境变量读取，`.env` 被 git 忽略，静态服务仅开放前端文件。模型请求仅含本次文本、待到访地点 ID/名称和选中排队地点，不主动附带酒店、预算或完整历史；用户自己写进文本的内容仍会发送，所以不要输入敏感数据。Responses 请求使用 store:false。

后端校验输入大小、类型、活动顺序、时间、费用和必去标记，并对执行结果复查已完成/必去约束。只允许本机来源，限制并发与频率。此版本无登录和服务端行程数据库；用户提交的本地快照不是可认证的历史记录，部署公网前需另做鉴权和服务端状态管理。

每次重规划请求向终端输出一条 JSON 日志：timestamp、source、status、responseMs、errorType。responseMs 为后端完整处理耗时（包含模型调用），不是纯模型延迟。不记录用户文本、行程、模型原文、请求头或密钥。没有日志面板和持久日志系统。浏览器 localStorage 仍保存本机计划及变化文本。

如需保存用于分析，可运行：

```sh
mkdir -p logs
node server.mjs | tee logs/development.log
```

日志中的 JSON 行可供后续脚本导出 JSON/CSV；首行启动信息不是 JSON。logs 已加入忽略清单。

## 测试

```sh
node --test tests/*.test.mjs
# 或 npm test
python3 build-standalone.py
```

已通过 36 项测试：原有 14 项规则测试不变，新增 22 项覆盖结构化校验、约束保护、Mock/AI 流程、拒绝/超时/401/429/500、隐私日志、HTTP 输入/来源/资源访问限制。浏览器已验证无密钥报错、手动规则回退、Mock 重排及来源标注。

## 文件结构与改动

```text
server.mjs                  新增：本机 HTTP 服务、静态资源和 API 路由
server/
  ai-client.mjs             新增：Responses API 调用、超时与错误处理
  intent-schema.mjs         新增：共享 schema 的后端入口
  validate-request.mjs      新增：请求校验与执行后约束检查
  replan-service.mjs        新增：AI/Mock → 校验 → 规则引擎
  mock-client.mjs           新增：明确标注的固定模拟响应
  telemetry.mjs             新增：允许字段清单式基础日志
  errors.mjs                新增：安全错误类型
 dist/
  api.mjs                   新增：前端请求后端
  intent.mjs                新增：结构化需求定义、校验、说明文案
  planner.mjs               修改：增加结构化需求入口，共用原规则核心
  app.mjs                   修改：模式、错误回退、识别说明
  index.html / styles.css   修改：原弹窗内的必要控件和说明
  data.mjs / assets/        保留：模拟地点和图片
 tests/
  planner.test.mjs          保留：原有 14 项
  ai.test.mjs               新增：22 项 API/输入/日志相关测试
.env.example / .gitignore   新增：环境变量模板与忽略规则
package.json               修改：启动、测试脚本
build-standalone.py         修改：包含新前端模块
SideQuest.html              重新生成的离线规则版
```

项目简介：SideQuest 将自然语言变化转成结构化旅行需求，再由可解释的规则引擎在时间、预算与必去约束下动态重排当天行程。
