export type StaticAsset = { fileName: string } & (
  | { width: number; height: number }
  | { width?: never; height?: never }
)

export type StaticAssetGroup = {
  prefix: string
  children: readonly StaticAsset[]
}

export type StaticAssetGroups = readonly StaticAssetGroup[]

export const aipochStaticAssets = [
  {
    prefix: 'public/f/image',
    children: [
      { fileName: 'Project-f176542f.webp' },
      { fileName: 'chart-ai-neural-2577ca39.webp' },
      { fileName: 'chart-cardiac-4c3035ad.webp' },
      { fileName: 'chart-multiomics-4ca80334.webp' },
      { fileName: 'contact-9d2c04ba.webp' },
      { fileName: 'figma-5fcb02c8.webp' },
      { fileName: 'file-b2436cc8.webp' },
      { fileName: 'hero-architecture-fd6f4997.webp' },
      { fileName: 'hero-vid-poster-279a4840.webp' },
      { fileName: 'home-providers-1-1424e2f9.svg' },
      { fileName: 'home-providers-2-98d0e5ab.svg' },
      { fileName: 'image1-a60be952.webp' },
      { fileName: 'image2-d259b524.webp' },
      { fileName: 'image3-2d6c3af2.webp' },
      { fileName: 'image4-4bfa6b84.webp' },
      { fileName: 'image5-f4a62ee5.webp' },
      { fileName: 'image6-39714155.webp' },
      { fileName: 'not-found-transparent-53227173.svg' },
      { fileName: 'og-bfe41bdd.webp' },
      { fileName: 'paper-fb87a969.webp' },
      { fileName: 'robot-81481448.webp' },
      { fileName: 'scientist1-e26b8ca8.webp' },
      { fileName: 'scientist2-d8d95a66.webp' },
      { fileName: 'scientist3-d7ec1289.webp' },
      { fileName: 'scientist4-a7f7f8ce.webp' },
      // Intrinsic image sizes share the same registry as their CDN filenames.
      { fileName: 'agent-skills-hero-3854ac8d.webp', width: 1672, height: 941 },
      { fileName: 'blog-hero-background-ef51ee4b.webp', width: 1672, height: 941 },
      { fileName: 'open-science-execution-22cf5be9.webp', width: 598, height: 559 },
      { fileName: 'open-science-specialists-495d54a2.webp', width: 606, height: 559 },
      { fileName: 'open-science-traceability-19cb72cd.webp', width: 601, height: 559 },
      { fileName: 'open-science-permissions-70f580a2.webp', width: 664, height: 559 },
      { fileName: 'open-science-setup-c4dee494.webp', width: 990, height: 521 },
      { fileName: 'open-science-hero-background-70ab9e46.webp', width: 1672, height: 941 },
      { fileName: 'open-science-workflow-591fc2f0.webp', width: 2223, height: 1162 },
      { fileName: 'open-science-define-6aaa1284.svg', width: 21, height: 21 },
      { fileName: 'open-science-plan-3b51af0c.svg', width: 21, height: 21 },
      { fileName: 'open-science-execute-984f88d9.svg', width: 21, height: 21 },
      { fileName: 'open-science-inspect-ab0f10a1.svg', width: 21, height: 21 },
      { fileName: 'open-science-deepseek-fd515caf.webp', width: 378, height: 278 },
      { fileName: 'open-science-bailian-fe2dbefa.webp', width: 512, height: 512 },
      { fileName: 'open-science-zhipu-63d0e7d0.webp', width: 640, height: 640 },
      { fileName: 'open-science-kimi-3257a67f.webp', width: 1024, height: 1024 },
      { fileName: 'open-science-minimax-9fbdddf5.webp', width: 48, height: 48 },
      { fileName: 'open-science-stepfun-3cd51f05.svg', width: 24, height: 24 },
      { fileName: 'open-science-xiaomi-5cfca3f4.webp', width: 447, height: 447 },
      { fileName: 'open-science-sensenova-80f4ed45.webp', width: 512, height: 512 },
      { fileName: 'open-science-volcengine-386151d7.webp', width: 48, height: 48 },
      { fileName: 'open-science-tencent-5bb16b63.webp', width: 640, height: 640 },
      { fileName: 'open-science-nvidia-0b35490c.webp', width: 1024, height: 1024 },
      { fileName: 'open-science-opencode-c758aa5b.webp', width: 1024, height: 1024 },
      { fileName: 'open-science-openrouter-35ecbca9.webp', width: 512, height: 512 },
      { fileName: 'open-science-apodex-d1af886c.svg', width: 24, height: 24 },
      { fileName: 'open-science-community-background-bb262071.webp', width: 1672, height: 941 },
      { fileName: 'aipoch-system-map-7511f128.png', width: 1672, height: 941 },
      { fileName: 'og-open-science-download-56121c38.png', width: 1065, height: 558 },
      { fileName: 'og-science-open-to-all-ab128c94.png', width: 1280, height: 672 },
      { fileName: 'medskillaudit-social-card-bcc353ec.png', width: 1280, height: 720 },
      { fileName: 'open-science-github-9c5574e6.svg', width: 14, height: 14 },
      { fileName: 'open-science-discord-10feb19d.svg', width: 14, height: 14 },
      { fileName: 'open-science-check-6530ff26.svg', width: 14, height: 10 }
    ]
  },
  {
    prefix: 'public/f/video',
    children: [
      { fileName: 'hero-vid-v2-1080p-bee9c53f.mp4' },
      { fileName: 'medskillaudit-l9s0f.mp4' },
      { fileName: 'open-science-v0-10-0-9ca70918.mp4' }
    ]
  },
  {
    prefix: 'public/f/icons',
    children: [{ fileName: 'githab-image-d03941b9.webp' }]
  }
] as const satisfies StaticAssetGroups

type RegisteredAsset = (typeof aipochStaticAssets)[number]['children'][number]
export type StaticImageFileName = Extract<
  RegisteredAsset,
  { width: number; height: number }
>['fileName']
