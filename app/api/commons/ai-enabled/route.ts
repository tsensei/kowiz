import { NextResponse } from 'next/server';
import { geminiService } from '@/lib/services/gemini.service';

export async function GET() {
  return NextResponse.json({
    enabled: geminiService.isEnabled(),
  });
}
