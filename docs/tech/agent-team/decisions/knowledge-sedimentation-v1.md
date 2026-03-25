# 知识沉淀 v1 方案（Doc-First）

## 决策
采用纯文档治理（Doc-First）方案进行知识沉淀。

## 核心原则
1. 经验写到工作区 `docs/tech/agent-team/` 目录，随 git 管理
2. 系统只定义规范，不提供搜索——agent 自己去 doc 目录读
3. 树状文件夹结构方便 agent 检索——目录名自描述，按主题嵌套
4. 每个文件不要太大——单文件不超 200 行
5. doc 里维护"如何维护 doc 的经验"——`workflows/knowledge-maintenance.md`
6. 不同 team 可以演进出不同工作模式

## 不做
- 向量数据库 / 嵌入检索
- wakeup 消息注入知识
- coord_knowledge.py 脚本
- 系统级搜索 API

## 目录结构
```
docs/tech/agent-team/
├── decisions/          # 架构决策记录
├── pitfalls/           # 踩坑记录
│   ├── frontend/       # 前端相关
│   ├── protocol/       # 协议相关
│   └── backend/        # 后端相关
├── workflows/          # 工作流规范
└── glossary/           # 专有名词
```

## 协议规则
- 干活前必查相关目录
- 干完后必写经验到对应目录
