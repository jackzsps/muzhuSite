import { z, defineCollection } from 'astro:content';

const portfolioCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    spaceType: z.enum(['客廳', '臥室', '書房', '廚房', '玄關', '全室', '商業空間']),
    materials: z.array(z.string()),
    area: z.string().optional(),
    duration: z.string().optional(),
    completedDate: z.date(),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = {
  'portfolio': portfolioCollection,
};
