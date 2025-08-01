# 🍚 Baojimi - 一个完全不专业的 Gemini API 轮询项目

## 🎭 这是什么鬼东西？

这是一个**极其不专业**当然也**极其不好用**的 Gemini API 代理服务！它能实现通过vercel轮询你的Gemini API Key。

### 🌟 不专业的特性

- 🎪 **OpenAI 兼容接口**
- 🎯 **智能负载均衡**
- 🎮 **可视化管理后台**
- 📊 **不详细的统计报告**
- ⚡ **Vercel Edge 加持**（没啥用）
- 🔐 **安全防护**（几乎没有，全靠你自己保管好密码）
- 🚀 **一键部署**（但是还要折腾数据库，麻烦）

## 🛠️ 技术栈（听起来很专业，实际很菜）

- **前端框架**：Next.js（因为它很火）
- **样式框架**：Tailwind CSS（因为写 CSS 太累了）
- **数据库**：Supabase PostgreSQL（免费的香）
- **缓存**：Vercel KV Redis（免费的用一下试试）
- **部署**：Vercel（一开始就冲着它免费的来的）
- **图标**：Lucide React（能看就行）


### 部署前的准备工作（不要偷懒）

1. **注册 Supabase 账号**：去 [supabase.com](https://supabase.com) 注册一个账号
2. **创建新项目**：在 Supabase 控制台创建一个新项目
3. **获取数据库信息**：在项目设置 → API 页面找到 URL 和 anon key
4. **执行数据库脚本**：在 SQL Editor 中运行 `database/schema.sql` 的内容

## 🔧 怎么部署

### 1. Fork本项目

### 2. 打开Vercel

登录后点击"Add New"，选择"Project"，然后选择你Fork的项目，点击Import。



### 3. 环境变量配置

在Environment Variables中添加以下变量：

```ini
# Supabase 数据库配置（必填，不填就等着报错吧）
SUPABASE_URL="你的_supabase_项目_url"
SUPABASE_ANON_KEY="你的_supabase_anon_key"

# 管理后台密码（必填，建议设置复杂一点）
PASSWORD="你的管理后台登录密码"

```

### 4. 数据库初始化（必要）

确认已经在 Supabase 控制台的 SQL Editor 中执行 `database/schema.sql` 中的 SQL 语句。

### 5. 在Vercel部署

然后点击Vercel中点击 Deploy 按钮进行部署。

## 📖 使用说明

### API 调用示例

```bash
# 聊天接口（装作是 OpenAI）
curl -X POST https://你的域名.vercel.app/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-你的访问密钥" \
  -d '{
    "model": "gemini-pro",
    "messages": [
      {"role": "user", "content": "你好，世界！"}
    ],
    "stream": false
  }'

# 获取模型列表
curl https://你的域名.vercel.app/api/v1/models \
  -H "Authorization: Bearer sk-你的访问密钥"
```

### 管理后台

访问 `https://你的域名.vercel.app/admin` 进入管理后台：

- 📊 **仪表盘**：查看调用统计和实时日志
- 🔑 **Gemini Keys 管理**：添加、删除、启用/禁用 API 密钥
- 🎫 **访问密钥管理**：管理客户端访问权限
- ⚙️ **系统设置**：各种配置选项

## 🎯 环境变量配置

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `SUPABASE_URL` | ✅ | - | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | ✅ | - | Supabase 匿名密钥 |
| `PASSWORD` | ✅ | - | 管理后台登录密码 |
| `DEFAULT_ACCESS_KEY` | ❌ | - | 默认的项目访问密钥 |
| `MAX_REQUESTS_PER_MINUTE` | ❌ | 30 | 每分钟最大请求数 |
| `MAX_REQUESTS_PER_DAY_PER_IP` | ❌ | 2000 | 每个 IP 每天最大请求数 |
| `MAX_LOG_COUNT` | ❌ | 300 | 数据库中保存的最大日志条数 |

## 🐛 常见问题

### Q: 为什么叫"Baojimi"？
A: 蹭，就硬蹭。

### Q: 这个项目靠谱吗？
A: 虽然看起来不专业，但代码质量确实也不怎么行。

### Q: 支持哪些 Gemini 模型？
A: 理论上支持所有 Gemini 模型，实际上要看实际情况。

### Q: 数据安全吗？
A: API 密钥存储在 Supabase 中，请确保你的数据库访问权限设置正确。

### Q: 可以商用吗？
A: 那是绝对不能商用的……这么烂的项目你也商用？说出去同行笑话你半年。

## 🤝 贡献指南

欢迎提交 PR，但请保持代码的"不专业"风格：

1. Fork 这个项目
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启一个 Pull Request

## 📄 许可证

MIT License - 随便用，但请保留作者信息。

## 🙏 致谢

- 感谢 Google 提供 Gemini API
- 感谢 Vercel 提供免费部署服务
- 感谢 Supabase 提供免费数据库
- 感谢我老婆的支持（虽然她不知道我在写什么）

---

**⚠️ 免责声明**：本项目仅供学习和个人使用，请遵守相关 API 的使用条款。**作者不对使用本项目造成的任何后果负责**。

**💡 小贴士**：如果你觉得这个项目确实没用，请给个 Star ⭐，谢谢！