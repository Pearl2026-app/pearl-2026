import { Module } from '@nestjs/common';
import { PublicCatalogueController } from './catalogue.public';
import { PublicContentController } from './content.public';

@Module({ controllers: [PublicCatalogueController, PublicContentController], exports: [] })
export class PublicModule {}
