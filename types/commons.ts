export type CommonsMetadata = {
  filename: string;
  description: string;
  license: string;
  categories: string[];
  author: string;
  date: string;
  source: string;
};

export type CommonsPublishItem = {
  fileId: string;
  release: 'own';
  metadata: CommonsMetadata;
};

export type CommonsPublishResult = {
  fileId: string;
  success: boolean;
  descriptionUrl?: string;
  warnings?: unknown;
  error?: string;
};
