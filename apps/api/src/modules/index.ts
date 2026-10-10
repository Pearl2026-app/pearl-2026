// Feature modules, registered in the app.
import { CatalogueModule } from './catalogue/catalogue.module';
import { ContentAdminModule } from './content/content.module';
import { NetworkModule } from './network/network.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { PublicModule } from './public/public.module';
import { EnquiriesModule } from './enquiries/enquiries.module';

export const FEATURE_MODULES: any[] = [NetworkModule, CatalogueModule, ContentAdminModule, UsersModule, SettingsModule, PublicModule, EnquiriesModule];
