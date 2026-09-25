package br.com.tauzeclass.mobile.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import javax.inject.Singleton

/**
 * Client HTTP genérico pra chamar rotas do site que NÃO são Postgrest (ex.:
 * app/api/contact-seller) — usa o mesmo engine Ktor/Android já trazido pelo
 * supabase-kt (ktor-client-android), sem dependência nova.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideHttpClient(): HttpClient = HttpClient()
}
