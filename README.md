# TikTok 广告投放记录可视化 MVP

这是基于需求文档先落地的本地静态 MVP，用来验证广告流程、上传解析和指标口径。

## 使用方式

打开本地服务地址：

```text
http://127.0.0.1:5178/index.html
```

如果服务没有运行，也可以在本目录启动：

```powershell
python -m http.server 5178
```

## 已实现

- 广告新增、改名、归档、恢复
- Excel / XLS / CSV 上传
- 从文件名识别日报日期，也可手动选择日期
- 按平台导出字段解析 23 个必需字段
- 兼容平台播放率长字段名
- 同广告同日期重复上传，最新版本生效
- 保存原始文件并支持下载
- 日报删除后自动切换同日剩余最新版本
- 素材按作品 ID 跨日报汇总
- `N/A` 显示为“商品卡片”
- 总 ROI、点击率、转化率、CPM 按汇总分子分母重新计算
- 广告详情页指标、筛选、搜索、排序、分页
- 素材趋势弹窗和每日明细
- 操作记录

## 当前限制

- 未配置 Supabase 时，数据保存在当前浏览器 `localStorage`。
- 配置 Supabase 后，数据会同步到云端 `app_state` 表，实现多人共享同一份数据。
- 当前云端版为了快速跑通，先用一张 JSON 状态表保存全部数据；后续数据量变大后，建议拆成广告、上传批次、每日明细、操作日志等多张表。

## Supabase 云端共享配置

1. 在 Supabase 创建一个新项目。
2. 打开项目的 SQL Editor。
3. 复制并执行 `supabase-schema.sql` 里的全部 SQL。
4. 打开项目的 Settings > API，复制：
   - Project URL
   - anon public key
5. 修改 `supabase-config.js`：

```js
window.SUPABASE_CONFIG = {
  url: "https://你的项目.supabase.co",
  anonKey: "你的 anon public key",
};
```

6. 提交并推送到 GitHub，GitHub Pages 更新后即可多人共享数据。

注意：当前需求是公开访问、无登录，所以 Supabase 策略也按公开读写配置。任何拿到网页地址的人都可以查看、上传、删除和归档数据。

