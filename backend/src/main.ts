import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const corsOrigin = process.env.CORS_ORIGIN || 'https://marketingfda.github.io';
  app.enableCors({
    origin: [corsOrigin, 'http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Disparador Fradema backend rodando na porta ${port}`);
}
bootstrap();
