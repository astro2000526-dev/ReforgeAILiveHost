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

export type SegmentType = 'intro' | 'pain' | 'product' | 'demo' | 'price' | 'cta'

export type ScriptSegment = {
  type: SegmentType
  text: string
  duration_sec: number
}

export type DemoScript = {
  productTitle: string
  productKeywords: string[]
  priceOriginal: number
  priceNow: number
  sellingPoints: string[]
  segments: ScriptSegment[]
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    productTitle: '烟酰胺精华液 30ml',
    productKeywords: ['烟酰胺', '精华', '美白', '护肤', '面部', '提亮'],
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
]

/**
 * Pick the demo script whose keywords best match the user's product title.
 * Returns the first bundle if nothing matches (so the demo never breaks).
 */
export function findBestDemoScript(productTitle: string): DemoScript {
  const lower = productTitle.toLowerCase()
  for (const d of DEMO_SCRIPTS) {
    if (d.productKeywords.some((k) => lower.includes(k.toLowerCase()))) {
      return d
    }
  }
  return DEMO_SCRIPTS[0]
}
