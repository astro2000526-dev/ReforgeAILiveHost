// Demo-mode script library for MVP.
//
// We don't call the Anthropic API in MVP demo mode — Claude (the human-typing
// version of it) hand-wrote these bundles in chat. Swap this file out for a
// real anthropic.messages.create() call once we add ANTHROPIC_API_KEY.
//
// Style notes baked in:
//   - 6-segment structure: intro / pain / product / demo / price / cta
//   - Each segment ~80–120 chars (~30 seconds of speech at default rate)
//   - Mandarin 直播带货 register: 家人们 / 宝子们 / 小黄车 / 限量
//   - Specific numbers > vague claims ("原价 199 现价 99" > "超便宜")
//
// Thai scripts for intimate-care category MUST avoid TikTok-sensitive words:
//   ❌ ช่องคลอด, เซ็กส์, อวัยวะเพศ (direct anatomical / sexual terms)
//   ✅ จุดซ่อนเร้น, บริเวณส่วนตัว, ดูแลสุขภาพ, สมดุล pH
// The female intimate-care category is heavily moderated on TikTok TH;
// scripts here lean medical / wellness framing, not allure.

export type SegmentType = 'intro' | 'pain' | 'product' | 'demo' | 'price' | 'cta'

export type ScriptSegment = {
  type: SegmentType
  text: string
  duration_sec: number
}

export type DemoScript = {
  productTitle: string
  productKeywords: string[]
  language: 'zh-CN' | 'th-TH' | 'en-US'
  priceOriginal: number
  priceNow: number
  sellingPoints: string[]
  segments: ScriptSegment[]
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    productTitle: '烟酰胺精华液 30ml',
    productKeywords: ['烟酰胺', '精华', '美白', '护肤', '面部', '提亮'],
    language: 'zh-CN',
    priceOriginal: 199,
    priceNow: 99,
    sellingPoints: ['5% 黄金浓度', 'B5 修护', '敏感肌可用', '30ml 大容量'],
    segments: [
      {
        type: 'intro',
        text: '亲爱的家人们，欢迎来到小美的直播间！还没点关注的姐妹们，点一下关注键，今晚十点抽免单！',
        duration_sec: 32,
      },
      {
        type: 'pain',
        text: '你是不是也经常熬夜加班，第二天起床镜子一照，皮肤暗沉、肤色不均、毛孔还粗大，涂啥粉底都遮不住？',
        duration_sec: 30,
      },
      {
        type: 'product',
        text: '今天给姐妹们带来这款明星同款烟酰胺精华，30 毫升大容量，5% 黄金浓度烟酰胺加 B5，温和不刺激，敏感肌也能放心用！',
        duration_sec: 36,
      },
      {
        type: 'demo',
        text: '看这质地，水润不黏腻，上脸秒吸收，一点都不糊。坚持用两周，肤色肉眼可见地提亮一个度，毛孔变细，气色完全不一样！',
        duration_sec: 38,
      },
      {
        type: 'price',
        text: '专柜原价 199 一瓶，今天直播间专属，只要 99！而且买一送一！相当于 50 块钱一瓶，这价格全网真的找不到第二家！',
        duration_sec: 36,
      },
      {
        type: 'cta',
        text: '数量真的不多，只有 100 单，已经被抢走 30 多单了！赶紧点屏幕下方小黄车下单，手慢的姐妹真的没了！',
        duration_sec: 32,
      },
    ],
  },
  {
    productTitle: '儿童益生菌粉 30 袋装',
    productKeywords: ['益生菌', '宝宝', '儿童', '婴幼儿', '母婴', '调理', '肠道'],
    language: 'zh-CN',
    priceOriginal: 198,
    priceNow: 99,
    sellingPoints: ['丹麦科汉森菌株', '100 亿活菌每袋', '0 添加 0 蔗糖', '6 个月以上可食用'],
    segments: [
      {
        type: 'intro',
        text: '宝妈们晚上好！欢迎进入小美的直播间！我自己也是两个孩子的妈，今天给大家带来一款育儿必备好物！',
        duration_sec: 32,
      },
      {
        type: 'pain',
        text: '宝宝是不是经常便秘、拉肚子、肚子胀气、不爱吃饭？一换奶粉就过敏？去医院医生只说调理肠道，可是怎么调？',
        duration_sec: 32,
      },
      {
        type: 'product',
        text: '今天这款儿童益生菌，丹麦科汉森的进口菌株，每袋 100 亿活菌，0 添加 0 蔗糖，奶香口味宝宝爱喝，6 个月以上就能吃！',
        duration_sec: 36,
      },
      {
        type: 'demo',
        text: '我家二宝喝完两周，便便规律了，吃饭也香了，最关键是免疫力上来了，整整一个月幼儿园没请假！家长群里好几个都问我买的啥！',
        duration_sec: 38,
      },
      {
        type: 'price',
        text: '线下药店一盒 30 袋要 198 块，今天直播间发车价 99，买二送一！相当于 33 一盒，敞开喝大半年没问题！',
        duration_sec: 34,
      },
      {
        type: 'cta',
        text: '厂家承诺无效全额退款，宝妈们放心拍！数量有限只有 200 单，过了今晚就恢复原价！点小黄车锁库存！',
        duration_sec: 30,
      },
    ],
  },
  {
    productTitle: '4L 大容量气炸锅',
    productKeywords: ['气炸锅', '空气炸锅', '厨房', '电器', '小家电', '炸锅', '减脂'],
    language: 'zh-CN',
    priceOriginal: 399,
    priceNow: 199,
    sellingPoints: ['4L 大容量', '可视化窗口', '减脂 90%', '一锅多用'],
    segments: [
      {
        type: 'intro',
        text: '家人们晚上好，欢迎进入小美的直播间！还没关注的家人们赶紧点关注，今晚十点全场抽免单！',
        duration_sec: 30,
      },
      {
        type: 'pain',
        text: '上班一天回家累得不想做饭？又想吃炸鸡薯条又怕长胖？厨房油烟大也不愿意开火？外卖既不健康又烧钱？',
        duration_sec: 32,
      },
      {
        type: 'product',
        text: '今天给家人们带来这款 4 升大容量气炸锅，可视化窗口实时看着熟，无油烹饪减脂 90%！一家四口的饭一锅全搞定！',
        duration_sec: 36,
      },
      {
        type: 'demo',
        text: '看，鸡翅放进去，5 分钟外酥里嫩，比肯德基还香！还能做薯条、蛋糕、烤红薯、烤鱼，一台顶四台，懒人厨房神器！',
        duration_sec: 36,
      },
      {
        type: 'price',
        text: '市面同款都要 399 起，今天直播间专属价 199 直接发车！还送硅胶夹、电子食谱、三层蒸架，超值！',
        duration_sec: 32,
      },
      {
        type: 'cta',
        text: '现在下单还包邮包安装！全国只有 50 台库存，已经被抢走 20 台了！家人们手速要快，错过等明年！点小黄车赶紧抢！',
        duration_sec: 36,
      },
    ],
  },
  {
    productTitle: '女性私密护理洗液 200ml',
    productKeywords: ['私密', '私护', '洗液', 'intimate', 'feminine', '护理'],
    language: 'zh-CN',
    priceOriginal: 299,
    priceNow: 99,
    sellingPoints: ['pH 5.5 弱酸性', '天然植物配方', '无香精无色素', '医师推荐'],
    segments: [
      {
        type: 'intro',
        text: '姐妹们好，欢迎来到健康直播间。今天给大家带来一款医师都在用的私密护理洗液，关注一下账号不错过下一场。',
        duration_sec: 32,
      },
      {
        type: 'pain',
        text: '姐妹们是不是经常觉得私密部位不舒服？换季有异味？普通沐浴露太刺激，越洗越敏感？这是私密肌肤 pH 失衡了。',
        duration_sec: 32,
      },
      {
        type: 'product',
        text: '这款私密护理洗液，pH 5.5 弱酸性，跟人体私密肌肤天然环境一致，天然植物配方，无香精无色素，孕妈也能用。',
        duration_sec: 34,
      },
      {
        type: 'demo',
        text: '看这质地，泡沫细腻不刺激。坚持用一个月，姐妹们都反馈干爽不闷不痒，整个人状态都不一样了，真心推荐。',
        duration_sec: 34,
      },
      {
        type: 'price',
        text: '专柜原价 299 一瓶，今天直播间限时 99！买两瓶送 50 毫升旅行装，相当于免费多送你 1/4 瓶！',
        duration_sec: 32,
      },
      {
        type: 'cta',
        text: '库存只剩 80 单，姐妹们点小黄车立即下单，过了今晚恢复原价！要囤的赶紧拍！',
        duration_sec: 28,
      },
    ],
  },
  {
    productTitle: 'ผลิตภัณฑ์ดูแลจุดซ่อนเร้น 200 มล.',
    productKeywords: [
      'intimate', 'feminine', 'ดูแล', 'จุดซ่อนเร้น', 'pH', 'private care',
      '私密', '私护', '泰', 'thai',
    ],
    language: 'th-TH',
    priceOriginal: 599,
    priceNow: 199,
    sellingPoints: ['pH 5.5 สมดุล', 'สารสกัดธรรมชาติ', 'ไม่มีน้ำหอม', 'แนะนำโดยแพทย์'],
    segments: [
      {
        type: 'intro',
        text: 'สวัสดีค่ะคุณผู้หญิงทุกท่าน ยินดีต้อนรับสู่ห้องไลฟ์สุขภาพของเรา วันนี้เรามีผลิตภัณฑ์ดูแลจุดซ่อนเร้นที่แพทย์แนะนำมาฝากทุกท่าน',
        duration_sec: 32,
      },
      {
        type: 'pain',
        text: 'พี่น้องผู้หญิงเคยรู้สึกระคายเคืองบริเวณส่วนตัวไหมคะ ใช้สบู่ทั่วไปแล้วยิ่งแห้งยิ่งคัน ลองหลายสูตรก็ยังไม่หายสักที',
        duration_sec: 32,
      },
      {
        type: 'product',
        text: 'ผลิตภัณฑ์ตัวนี้มี pH 5.5 สมดุลตามธรรมชาติของผิว ใช้สารสกัดธรรมชาติ ไม่มีน้ำหอม ไม่มีสี อ่อนโยนแม้แต่คุณแม่ตั้งครรภ์ก็ใช้ได้',
        duration_sec: 36,
      },
      {
        type: 'demo',
        text: 'เนื้อสัมผัสนุ่มนวล ฟองละเอียด ไม่แสบ ใช้ติดต่อกัน 1 เดือน ลูกค้ารีวิวว่าหายระคายเคือง สดชื่นทั้งวัน มั่นใจขึ้นมาก',
        duration_sec: 34,
      },
      {
        type: 'price',
        text: 'ราคาปกติ 599 บาท วันนี้ในไลฟ์ลดเหลือเพียง 199 บาท ซื้อ 2 ขวดแถมขวดเดินทาง 50 มล. ฟรี คุ้มมาก',
        duration_sec: 32,
      },
      {
        type: 'cta',
        text: 'จำนวนจำกัด เหลือ 80 ชิ้นแล้ว กดตะกร้าสีเหลืองสั่งเลย พลาดวันนี้ราคากลับเป็น 599 ทันที',
        duration_sec: 30,
      },
    ],
  },
  {
    productTitle: 'Niacinamide Brightening Serum 30ml',
    productKeywords: ['serum', 'niacinamide', 'skin', 'brighten', 'beauty', 'glow', 'face'],
    language: 'en-US',
    priceOriginal: 39,
    priceNow: 19,
    sellingPoints: ['5% niacinamide', 'B5 repair', 'fragrance-free', 'sensitive-skin safe'],
    segments: [
      {
        type: 'intro',
        text: "Hi everyone, welcome to the live room! Hit that follow button now — we're giving away a free order at the top of the hour!",
        duration_sec: 30,
      },
      {
        type: 'pain',
        text: 'Tired skin, uneven tone, dullness after late nights? No foundation seems to cover it and your pores look bigger every day?',
        duration_sec: 30,
      },
      {
        type: 'product',
        text: 'Today I have this best-selling niacinamide serum — a generous 30ml bottle, 5% niacinamide plus B5, gentle enough for sensitive skin.',
        duration_sec: 34,
      },
      {
        type: 'demo',
        text: 'Look at the texture — lightweight, absorbs in seconds, never sticky. Two weeks in, skin looks visibly brighter and pores look tighter.',
        duration_sec: 36,
      },
      {
        type: 'price',
        text: 'Retail is 39 dollars a bottle. Tonight, live-room only: just 19 — and buy one get one free. You will not find this price anywhere else.',
        duration_sec: 34,
      },
      {
        type: 'cta',
        text: 'Only 100 units, and over 30 are already gone! Tap the cart below and order now — once they sell out tonight, the price goes back up.',
        duration_sec: 32,
      },
    ],
  },
  {
    productTitle: '4L Air Fryer',
    productKeywords: ['air fryer', 'fryer', 'kitchen', 'appliance', 'cook', 'gadget'],
    language: 'en-US',
    priceOriginal: 99,
    priceNow: 49,
    sellingPoints: ['4L capacity', 'viewing window', '90% less oil', 'multi-use'],
    segments: [
      {
        type: 'intro',
        text: 'Good evening everyone, welcome in! Smash that follow — top of the hour we are drawing for a totally free order!',
        duration_sec: 30,
      },
      {
        type: 'pain',
        text: 'Too tired to cook after work? Craving fries and wings but scared of the calories — and tired of greasy pans and pricey takeout?',
        duration_sec: 32,
      },
      {
        type: 'product',
        text: 'This 4-litre air fryer has a viewing window so you watch it cook, and oil-free frying cuts up to 90% of the fat. Feeds the whole family.',
        duration_sec: 36,
      },
      {
        type: 'demo',
        text: 'Wings in — five minutes, crispy outside, juicy inside, better than fast food. Fries, cake, roast fish too. One machine does it all.',
        duration_sec: 34,
      },
      {
        type: 'price',
        text: 'Same models go for 99 and up. Tonight in the live room: 49 dollars flat, plus a free recipe book and tongs. Incredible value.',
        duration_sec: 32,
      },
      {
        type: 'cta',
        text: 'Free shipping right now, only 50 units nationwide and 20 are already claimed. Be quick — tap the cart and grab yours before they vanish!',
        duration_sec: 34,
      },
    ],
  },
]

/**
 * Pick the demo script whose keywords best match the user's product title.
 *
 * When `language` is provided we first filter to scripts matching that
 * language. If nothing matches we fall back to all scripts so the demo never
 * 404s on an unknown title.
 */
export function findBestDemoScript(
  productTitle: string,
  language?: string
): DemoScript {
  const lower = productTitle.toLowerCase()
  const pool = language
    ? DEMO_SCRIPTS.filter((d) => d.language === language)
    : DEMO_SCRIPTS
  const searchPool = pool.length > 0 ? pool : DEMO_SCRIPTS

  for (const d of searchPool) {
    if (d.productKeywords.some((k) => lower.includes(k.toLowerCase()))) {
      return d
    }
  }
  return searchPool[0]
}
