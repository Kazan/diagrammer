package com.example.diagrammerapp.di

import android.os.Handler
import android.os.Looper
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class MainHandler

@Module
@InstallIn(SingletonComponent::class)
object CoreModule {
    @IoDispatcher
    @Provides
    fun providesIoDispatcher(): CoroutineDispatcher = Dispatchers.IO

    @MainHandler
    @Provides
    @Singleton
    fun providesMainHandler(): Handler = Handler(Looper.getMainLooper())
}
