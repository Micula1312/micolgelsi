import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const researchArea = z.enum([
  'urban-wilderness',
  'generative-archives',
  'interspecies',
  'technology-digitalization',
  'emotional-geographies',
  'eco-feminism',
  'pleasure-activism'
]);

const moment = z.object({
  date: z.string(),
  title: z.string(),
  type: z.string().optional(),
  location: z.string().optional(),
  media: z.string().optional(),
  href: z.string().optional(),
  curatedBy: z.string().optional(),
  artistsInvolved: z.string().optional(),
  credits: z.string().optional(),
  photoCredits: z.string().optional(),
  collaborators: z.string().optional()
});

const common = z.object({
  title: z.string(),
  year: z.union([z.number(), z.string()]),
  displayType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['ongoing', 'completed']).default('completed'),
  summary: z.string().optional(),
  location: z.string().optional(),
  medium: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  researchAreas: z.array(researchArea).default([]),
  collaborators: z.array(z.string()).default([]),
  artistsInvolved: z.array(z.string()).default([]),
  curatedBy: z.array(z.string()).default([]),
  credits: z.array(z.string()).default([]),
  photoCredits: z.array(z.string()).default([]),
  avatar: z.string().optional(),
  cover: z.string().optional(),
  gallery: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  moments: z.array(moment).default([]),
  featured: z.boolean().default(false),
  portfolio: z.object({ art: z.boolean().default(false), research: z.boolean().default(false), digital: z.boolean().default(false) }).default({ art: false, research: false, digital: false })
});

const projects = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }), schema: common.extend({ type: z.literal('project'), works: z.array(z.string()).default([]) }) });
const exhibitions = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/exhibitions' }), schema: common.extend({ type: z.literal('exhibition'), works: z.array(z.string()).default([]), dates: z.string().optional() }) });
const works = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/works' }), schema: common.extend({ type: z.literal('work'), parent: z.object({ type: z.enum(['project', 'exhibition']), slug: z.string() }).optional() }) });

const external = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/external' }),
  schema: z.object({ title: z.string(), kind: z.string().default('external project'), year: z.union([z.number(), z.string()]).optional(), startDate: z.string().optional(), endDate: z.string().optional(), status: z.enum(['ongoing', 'completed']).default('completed'), url: z.string().optional(), summary: z.string().optional(), themes: z.array(z.string()).default([]), researchAreas: z.array(researchArea).default([]), collaborators: z.array(z.string()).default([]), artistsInvolved: z.array(z.string()).default([]), curatedBy: z.array(z.string()).default([]), credits: z.array(z.string()).default([]), photoCredits: z.array(z.string()).default([]), avatar: z.string().optional(), moments: z.array(moment).default([]) })
});

const playground = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/playground' }), schema: z.object({ title: z.string(), url: z.string().optional(), year: z.union([z.number(), z.string()]).optional(), summary: z.string().optional(), avatar: z.string().optional(), tags: z.array(z.string()).default([]) }) });
const research = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/research' }), schema: z.object({ title: z.string(), key: researchArea, summary: z.string().optional() }) });

export const collections = { projects, exhibitions, works, external, playground, research };
