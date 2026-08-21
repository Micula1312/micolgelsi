import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const common = z.object({
  title: z.string(),
  year: z.union([z.number(), z.string()]),
  status: z.enum(['ongoing', 'completed']).default('completed'),
  summary: z.string().optional(),
  location: z.string().optional(),
  medium: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  cover: z.string().optional(),
  featured: z.boolean().default(false),
  portfolio: z.object({
    art: z.boolean().default(false),
    research: z.boolean().default(false),
    digital: z.boolean().default(false)
  }).default({ art: false, research: false, digital: false })
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: common.extend({
    type: z.literal('project'),
    works: z.array(z.string()).default([])
  })
});

const exhibitions = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/exhibitions' }),
  schema: common.extend({
    type: z.literal('exhibition'),
    works: z.array(z.string()).default([]),
    dates: z.string().optional()
  })
});

const works = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/works' }),
  schema: common.extend({
    type: z.literal('work'),
    parent: z.object({
      type: z.enum(['project', 'exhibition']),
      slug: z.string()
    }).optional()
  })
});

export const collections = { projects, exhibitions, works };
