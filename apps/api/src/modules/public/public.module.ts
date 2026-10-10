import { Module } from '@nestjs/common';
import { PublicCatalogueController } from './catalogue.public';
import { PublicContentController } from './content.public';
import { RingFinderController } from './ring-finder.public';

@Module({ controllers: [PublicCatalogueController, PublicContentController, RingFinderController], exports: [] })
export class PublicModule {}
