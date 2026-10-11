# 将巴黎版 SideQuest 放到网上

## GitHub + Render 免费服务

1. 在 GitHub 新建仓库 `sidequest`。解压交付的 `SideQuest-Paris-Deploy.zip`，将其中项目文件上传到仓库根目录。根目录应直接看到 package.json、server.mjs、render.yaml。压缩包不含 `.env`、密钥或日志。不要上传你本机的 `.env`。
2. 登录 https://dashboard.render.com ，选择 New → Blueprint，连接这个仓库。Render 会读取 render.yaml。确认套餐为 Free。
3. 在提示的 DEEPSEEK_API_KEY 中填写你自己的密钥，再部署。其他变量已配置。无需购买域名。
4. 等部署变为 Live，打开 Render 给你的 https://…onrender.com 地址。它才是可以放到简历的公开链接。
5. 检查默认巴黎行程、Mock、规则模式，再用一句不含个人信息的输入测试 AI。平台日志 source=ai、status=applied 与页面识别结果都成功，才说明线上真实调用通过。

若使用 New → Web Service 手工配置：Runtime=Node；Build Command=`node --test tests/*.test.mjs`；Start Command=`node server.mjs`；套餐 Free；环境变量照 render.yaml 填写。不要设置本机的 PORT=4174，使用 Render 提供的 PORT。Render 自动提供 RENDER_EXTERNAL_URL 用于来源校验。自定义域名时另设 PUBLIC_ORIGIN=https://你的域名（不带末尾斜杠）。

## 展示与费用边界

- Render 免费实例闲置 15 分钟会休眠，再访问可能约一分钟启动。建议简历附一分钟演示视频；中国大陆访问速度需实际测试。
- 免费托管不等于免费模型调用。DeepSeek 仍按实际用量收费。
- 默认单进程每天最多接收 100 次真实 AI 请求（含失败尝试），Mock/规则不消耗模型额度。AI_DAILY_LIMIT 可改为更小值或 0。计数在 UTC 零点或服务重启时重置，是演示限流，不是持久账单硬上限；不要据此承诺绝不会超支。
- 没有账号系统，访客共享演示限额。密钥只放 Render 的环境变量，本机 .env 不进仓库。
- 行程保存到访客自己的浏览器。旅行地点和费用等仍是模拟数据。
- 未在本次交付中创建 GitHub 仓库或发布 Render 服务；需要你登录账号完成以上操作。

官方参考：https://render.com/docs/web-services 、 https://render.com/docs/blueprint-spec 、 https://render.com/docs/free
