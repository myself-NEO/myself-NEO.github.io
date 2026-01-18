
export interface Milestone {
  year: string;
  title: string;
  location: string;
  description: string;
}

export interface Skill {
  name: string;
  category: 'frontend' | 'backend' | 'cloud' | 'tools';
  icon: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}
