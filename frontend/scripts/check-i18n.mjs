#!/usr/bin/env node
// Bilingual catalog gate for the Acuity frontend.
//
// 1. Key parity: for every app, messages/en-HK.json and messages/zh-Hant-HK.json
//    must declare exactly the same (deep-flattened) key set. English (Hong
//    Kong) is the default locale; Traditional Chinese (Hong Kong) has full
//    parity — a key present in one catalog and not the other fails the build.
// 2. Simplified-Chinese scan: the product ships Traditional Chinese only.
//    Catalogs and source are scanned for characters that exist only in the
//    Simplified script (simplified-only radical families plus a curated list
//    of high-confidence simplified-only characters). Any hit fails the build.
//
// Usage: node scripts/check-i18n.mjs   (exit 0 = clean, 1 = violations)

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const LOCALES = ["en-HK", "zh-Hant-HK"];

let failures = 0;

// ---------- 1. Key parity per app ----------

function flatten(obj, prefix = "", out = []) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

// Catalog owners: apps and shared packages that carry a messages/ directory
// (e.g. packages/auth-ui ships its own bilingual catalogs).
const catalogOwners = [];
for (const group of ["apps", "packages"]) {
  const groupDir = join(ROOT, group);
  if (!existsSync(groupDir)) continue;
  for (const entry of readdirSync(groupDir)) {
    if (existsSync(join(groupDir, entry, "messages"))) {
      catalogOwners.push(`${group}/${entry}`);
    }
  }
}

for (const owner of catalogOwners) {
  const catalogs = {};
  for (const locale of LOCALES) {
    const file = join(ROOT, owner, "messages", `${locale}.json`);
    if (!existsSync(file)) {
      console.error(`✗ ${owner}: missing catalog messages/${locale}.json`);
      failures++;
      continue;
    }
    catalogs[locale] = new Set(flatten(JSON.parse(readFileSync(file, "utf8"))));
  }
  const [en, zh] = [catalogs["en-HK"], catalogs["zh-Hant-HK"]];
  if (!en || !zh) continue;
  const missingInZh = [...en].filter((k) => !zh.has(k));
  const missingInEn = [...zh].filter((k) => !en.has(k));
  if (missingInZh.length || missingInEn.length) {
    failures++;
    console.error(`✗ ${owner}: catalog key parity broken`);
    for (const k of missingInZh) console.error(`    zh-Hant-HK missing: ${k}`);
    for (const k of missingInEn) console.error(`    en-HK missing: ${k}`);
  } else {
    console.log(`✓ ${owner}: ${en.size} keys, en-HK ↔ zh-Hant-HK parity exact`);
  }
}

// ---------- 2. Simplified-Chinese scan ----------

// Simplified-only radical families (these component forms never occur in
// Traditional text) plus high-confidence simplified-only characters. The set
// is conservative: characters shared by both scripts (e.g. 中, 文, 台, 里)
// are deliberately excluded so Traditional content never false-positives.
const SIMPLIFIED_ONLY =
  // 讠 speech radical family
  "计订认讥议讯记讲讳讶讷许论讼讽设访诀证评识诈诉诊词译试诗诚话诞询该详诫语误说诵请诸诺读课谁调谅谈谊谋谎谐谓谜谢谣谨谬谭谱" +
  // 贝 shell radical family
  "贝财败货质贩贪贫购贮贴贵贷贸费贺贼资赋赌赔赖赚赛赞赠赢账" +
  // 钅 metal radical family
  "钉针钓钟钢钥钱钻铁铃铅银铺链锁锅错锦键镜" +
  // 纟 silk radical family
  "纠红纤约级纪纯纳纸纹纺线练组细织终绍经绑绕绘给络统绝绢继绩绪续维绵综缓编缘缠缩缴" +
  // 饣 food radical family
  "饭饮饰饱饿馆" +
  // 门 gate radical family
  "门闪闭问闯间闷闸闹闻阅阔" +
  // 页 head radical family
  "页顶顷项顺须顽顾顿颁颂预领颇频颖题额颜" +
  // 车 cart radical family
  "车轨转轮软轻载较辅辆辈辉输" +
  // 马 / 鸟 animal radical families
  "马驱驶驻驾验骑骗鸟鸡鸣鸭鹅" +
  // structural simplifications
  "风飞龙齐韦" +
  // curated high-confidence simplified-only characters
  "爱办备笔变标补仓产尝齿处传单当挡党导灯点电断对队发复盖个关观广归国过华画欢环还汇会击积极际坚见荐节尽惊旧剧觉开块亏扩览劳乐类离历丽连两辽临灵龄岭龙楼陆录虑乱罗买卖满们梦灭亩难恼脑农盘凭启气迁枪墙桥亲庆穷区权劝确让认荣洒伞丧扫杀晒伤绳胜圣师时实势书术树双丝虽随岁孙态坛叹汤讨腾体条厅听头图团万为伟违卫稳务雾牺习戏细显现乡响协写兴选学训压严盐阳养样药爷业叶医亿忆艺阴隐应营拥优邮犹鱼渔与屿狱员园圆远跃运杂灾脏责斋战阵职钟众昼猪筑状浊总纵独夺尔纷妇赶沟构顾贯汉护换挥获级挤价歼简舰骄紧仅军";

const simplifiedRe = new RegExp(`[${SIMPLIFIED_ONLY}]`, "u");
const SCAN_EXT = new Set([".ts", ".tsx", ".json"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "test-results",
  "playwright-report",
  "generated",
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXT.has(entry.slice(entry.lastIndexOf(".")))) {
      yield full;
    }
  }
}

const scanRoots = [];
for (const group of ["apps", "packages"]) {
  const groupDir = join(ROOT, group);
  if (!existsSync(groupDir)) continue;
  for (const entry of readdirSync(groupDir)) {
    for (const sub of ["src", "messages"]) {
      const dir = join(groupDir, entry, sub);
      if (existsSync(dir) && statSync(dir).isDirectory()) scanRoots.push(dir);
    }
  }
}

let simplifiedHits = 0;
for (const rootDir of scanRoots) {
  for (const file of walk(rootDir)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = line.match(simplifiedRe);
      if (match) {
        simplifiedHits++;
        console.error(
          `✗ Simplified-Chinese character "${match[0]}" at ${relative(ROOT, file)}:${index + 1}`,
        );
      }
    });
  }
}

if (simplifiedHits === 0) {
  console.log(`✓ Simplified-Chinese scan clean (${scanRoots.length} roots)`);
} else {
  failures++;
}

process.exit(failures ? 1 : 0);
