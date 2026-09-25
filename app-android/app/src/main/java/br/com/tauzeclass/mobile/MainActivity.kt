package br.com.tauzeclass.mobile

import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.AddCircle
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import br.com.tauzeclass.mobile.feature.ads.AdDetailScreen
import br.com.tauzeclass.mobile.feature.anunciar.AnunciarWizardScreen
import br.com.tauzeclass.mobile.feature.auctions.AuctionDetailScreen
import br.com.tauzeclass.mobile.feature.auctions.AuctionsListScreen
import br.com.tauzeclass.mobile.feature.auth.LoginScreen
import br.com.tauzeclass.mobile.feature.auth.RegisterScreen
import br.com.tauzeclass.mobile.feature.auth.SessionViewModel
import br.com.tauzeclass.mobile.feature.checkout.CheckoutScreen
import br.com.tauzeclass.mobile.feature.events.EventDetailScreen
import br.com.tauzeclass.mobile.feature.events.EventsListScreen
import br.com.tauzeclass.mobile.feature.favorites.FavoritesScreen
import br.com.tauzeclass.mobile.feature.home.HomeScreen
import br.com.tauzeclass.mobile.feature.institucional.InstitucionalIndexScreen
import br.com.tauzeclass.mobile.feature.institucional.InstitucionalPageScreen
import br.com.tauzeclass.mobile.feature.kyc.VerificacaoScreen
import br.com.tauzeclass.mobile.feature.listagem.ListagemScreen
import br.com.tauzeclass.mobile.feature.messages.ChatScreen
import br.com.tauzeclass.mobile.feature.painel.PainelScreen
import br.com.tauzeclass.mobile.feature.plans.PlansScreen
import br.com.tauzeclass.mobile.feature.seller.VendedorScreen
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcDisplayFontFamily
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import br.com.tauzeclass.mobile.ui.theme.TauzeClassTheme
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.auth.status.SessionStatus

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TauzeClassTheme {
                RootScreen()
            }
        }
    }
}

/**
 * Portão de autenticação da raiz do app — observa sessionStatus (Supabase
 * Auth) e decide entre a pilha de login/cadastro e o app principal com
 * bottom nav. Mesma lógica de proteção de rotas do site
 * (app/(public)/layout.tsx redireciona pra /login quando não autenticado),
 * só que aqui é feito trocando o conteúdo raiz em vez de redirect de URL.
 */
@Composable
private fun RootScreen(sessionViewModel: SessionViewModel = hiltViewModel()) {
    val sessionStatus by sessionViewModel.sessionStatus.collectAsStateWithLifecycle()

    when (sessionStatus) {
        is SessionStatus.Authenticated -> TauzeClassApp()
        is SessionStatus.NotAuthenticated, is SessionStatus.RefreshFailure -> AuthNavGraph()
        SessionStatus.Initializing -> Box(
            modifier = Modifier.fillMaxSize().background(TcColors.PrimaryPale),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier.size(64.dp).background(TcGradient.Primary, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text("TC", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, fontFamily = TcDisplayFontFamily)
                }
                Spacer(Modifier.height(16.dp))
                CircularProgressIndicator(color = TcColors.Primary)
            }
        }
    }
}

@Composable
private fun AuthNavGraph() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = "login") {
        composable("login") {
            LoginScreen(
                onLoginSuccess = { /* sessionStatus muda sozinho via StateFlow, RootScreen reage */ },
                onNavigateToRegister = { navController.navigate("register") }
            )
        }
        composable("register") {
            RegisterScreen(
                onRegisterSuccess = { /* idem */ },
                onNavigateToLogin = { navController.popBackStack() }
            )
        }
    }
}

private sealed class Screen(val route: String, val iconOutlined: ImageVector, val iconFilled: ImageVector) {
    data object Home : Screen("home", Icons.Outlined.Home, Icons.Filled.Home)
    data object Buscar : Screen("listagem?categoria={categoria}&busca={busca}", Icons.Outlined.Search, Icons.Filled.Search)
    data object Anunciar : Screen("anunciar", Icons.Outlined.AddCircle, Icons.Filled.AddCircle)
    data object Favoritos : Screen("favoritos", Icons.Outlined.FavoriteBorder, Icons.Filled.Favorite)
    data object Painel : Screen("painel", Icons.Outlined.Dashboard, Icons.Filled.Dashboard)
}

/** Rótulo exibido na bottom nav — resolvido no local de composição (sealed class não pode chamar stringResource() no construtor). Mesmo padrão de PainelTab.label() em PainelScreen.kt. */
@Composable
private fun Screen.label(): String = when (this) {
    Screen.Home -> stringResource(R.string.nav_home)
    Screen.Buscar -> stringResource(R.string.nav_search)
    Screen.Anunciar -> stringResource(R.string.nav_post_ad)
    Screen.Favoritos -> stringResource(R.string.nav_favorites)
    Screen.Painel -> stringResource(R.string.nav_dashboard)
}

private val bottomNavItems = listOf(
    Screen.Home,
    Screen.Buscar,
    Screen.Anunciar,
    Screen.Favoritos,
    Screen.Painel
)

@Composable
private fun TauzeClassApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    // Esconde a bottom nav em telas de detalhe empilhadas por cima das 5 abas
    // (ex.: Anúncio) — mesma lógica visual de "afundar" na navegação que o
    // site tem via rota própria (/anuncio/[slug]).
    val showBottomBar = bottomNavItems.any { it.route == currentRoute }

    Scaffold(
        containerColor = TcColors.Bg,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = TcColors.Surface,
                    tonalElevation = 0.dp, // sombra própria abaixo, não somar com tonal elevation do M3
                    modifier = Modifier.shadow(elevation = 8.dp) // sombra nativa projeta pra cima corretamente numa barra fixa no rodapé
                ) {
                    bottomNavItems.forEach { screen ->
                        val selected = currentRoute == screen.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                val target = if (screen == Screen.Buscar) "listagem" else screen.route
                                navController.navigate(target) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                if (screen == Screen.Anunciar) {
                                    AnunciarNavIcon()
                                } else {
                                    Icon(
                                        imageVector = if (selected) screen.iconFilled else screen.iconOutlined,
                                        contentDescription = screen.label()
                                    )
                                }
                            },
                            label = { Text(screen.label(), fontWeight = if (screen == Screen.Anunciar) FontWeight.Bold else FontWeight.Normal) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = TcColors.Primary,
                                selectedTextColor = TcColors.Primary,
                                indicatorColor = TcColors.PrimaryPale,
                                unselectedIconColor = TcColors.TextMuted,
                                unselectedTextColor = TcColors.TextMuted,
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    onAdClick = { ad -> navController.navigate("anuncio/${ad.slug}") },
                    onSeeAllClick = { navController.navigate("listagem") },
                    onSearchSubmit = { query, categoria ->
                        navController.navigate("listagem?categoria=${categoria ?: ""}&busca=${Uri.encode(query)}")
                    },
                    onCategoriaClick = { id -> navController.navigate("listagem?categoria=$id") },
                    onAnunciarClick = { navController.navigate("anunciar") },
                    onSeeAllAuctionsClick = { navController.navigate("leiloes") },
                    onAuctionClick = { event -> navController.navigate("leiloes/${event.slug}") },
                    onSeeAllEventsClick = { navController.navigate("eventos") },
                    onEventClick = { event -> navController.navigate("eventos/${event.id}") }
                )
            }
            composable("leiloes") {
                AuctionsListScreen(
                    onBackClick = { navController.popBackStack() },
                    onAuctionClick = { event -> navController.navigate("leiloes/${event.slug}") }
                )
            }
            composable(
                route = "leiloes/{slug}",
                arguments = listOf(navArgument("slug") { type = NavType.StringType }),
                deepLinks = listOf(navDeepLink { uriPattern = "br.com.tauzeclass.mobile://leiloes/{slug}" })
            ) {
                AuctionDetailScreen(onBackClick = { navController.popBackStack() })
            }
            composable("eventos") {
                EventsListScreen(
                    onBackClick = { navController.popBackStack() },
                    onEventClick = { event -> navController.navigate("eventos/${event.id}") }
                )
            }
            composable(
                route = "eventos/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
                deepLinks = listOf(navDeepLink { uriPattern = "br.com.tauzeclass.mobile://eventos/{id}" })
            ) {
                EventDetailScreen(onBackClick = { navController.popBackStack() })
            }
            composable(
                route = "listagem?categoria={categoria}&busca={busca}",
                arguments = listOf(
                    navArgument("categoria") { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument("busca") { type = NavType.StringType; nullable = true; defaultValue = null },
                )
            ) {
                ListagemScreen(onAdClick = { ad -> navController.navigate("anuncio/${ad.slug}") })
            }
            composable(Screen.Anunciar.route) {
                AnunciarWizardScreen(
                    onBackClick = { navController.popBackStack() },
                    onDone = { navController.navigate(Screen.Painel.route) { popUpTo(Screen.Anunciar.route) { inclusive = true } } }
                )
            }
            // Rota literal separada da aba "anunciar" (não query-string, ex.
            // "anunciar?id={id}") de propósito — evita a ambiguidade de duas
            // rotas com o mesmo prefixo "anunciar" competindo pelo mesmo clique
            // de bottom nav (visto com Screen.Buscar/listagem: navegar pro
            // literal "anunciar?id={id}" sem substituir o placeholder navegaria
            // pra um id igual à string "{id}").
            composable(
                route = "anunciar_editar/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType })
            ) {
                AnunciarWizardScreen(
                    onBackClick = { navController.popBackStack() },
                    onDone = { navController.popBackStack() }
                )
            }
            composable(Screen.Favoritos.route) {
                FavoritesScreen(
                    onAdClick = { ad -> navController.navigate("anuncio/${ad.slug}") },
                    onExploreClick = { navController.navigate("listagem") }
                )
            }
            composable(Screen.Painel.route) {
                PainelScreen(
                    onEditAd = { id -> navController.navigate("anunciar_editar/$id") },
                    onInstitucionalClick = { navController.navigate("institucional") },
                    onVerificarIdentidadeClick = { navController.navigate("verificacao") },
                    onPlanosClick = { navController.navigate("planos") },
                    onOpenChat = { adId, otherId, otherName, adTitle ->
                        navController.navigate("chat/$adId/$otherId?otherName=${Uri.encode(otherName)}&adTitle=${Uri.encode(adTitle)}")
                    }
                )
            }
            composable("verificacao") {
                VerificacaoScreen(onBackClick = { navController.popBackStack() })
            }
            composable("planos") {
                PlansScreen(
                    onBackClick = { navController.popBackStack() },
                    onSubscribeClick = { plan, cycle -> navController.navigate("checkout/${plan.id}?billingCycle=${cycle.apiValue}") }
                )
            }
            composable(
                route = "checkout/{planId}?billingCycle={billingCycle}",
                arguments = listOf(
                    navArgument("planId") { type = NavType.StringType },
                    navArgument("billingCycle") { type = NavType.StringType; defaultValue = "monthly" },
                )
            ) {
                CheckoutScreen(onBackClick = { navController.popBackStack() })
            }
            composable("institucional") {
                InstitucionalIndexScreen(
                    onBackClick = { navController.popBackStack() },
                    onPageClick = { slug -> navController.navigate("institucional/$slug") }
                )
            }
            composable(
                route = "institucional/{slug}",
                arguments = listOf(navArgument("slug") { type = NavType.StringType })
            ) { backStackEntry ->
                InstitucionalPageScreen(
                    slug = checkNotNull(backStackEntry.arguments?.getString("slug")),
                    onBackClick = { navController.popBackStack() }
                )
            }
            composable(
                route = "anuncio/{slug}",
                arguments = listOf(navArgument("slug") { type = NavType.StringType }),
                // Deep link próprio (br.com.tauzeclass.mobile://anuncio/{slug}) —
                // útil pra abrir direto num anúncio específico (compartilhamento,
                // notificação push no futuro), testado via adb nesta sessão.
                deepLinks = listOf(navDeepLink { uriPattern = "br.com.tauzeclass.mobile://anuncio/{slug}" })
            ) {
                AdDetailScreen(
                    onBackClick = { navController.popBackStack() },
                    onSellerClick = { slugOrId -> navController.navigate("vendedor/$slugOrId") },
                    onMessageSellerClick = { adId, sellerId, sellerName, adTitle ->
                        navController.navigate("chat/$adId/$sellerId?otherName=${Uri.encode(sellerName)}&adTitle=${Uri.encode(adTitle)}")
                    }
                )
            }
            composable(
                route = "vendedor/{slug}",
                arguments = listOf(navArgument("slug") { type = NavType.StringType }),
                deepLinks = listOf(navDeepLink { uriPattern = "br.com.tauzeclass.mobile://vendedor/{slug}" })
            ) {
                VendedorScreen(
                    onBackClick = { navController.popBackStack() },
                    onAdClick = { ad -> navController.navigate("anuncio/${ad.slug}") }
                )
            }
            composable(
                route = "chat/{adId}/{otherId}?otherName={otherName}&adTitle={adTitle}",
                arguments = listOf(
                    navArgument("adId") { type = NavType.StringType },
                    navArgument("otherId") { type = NavType.StringType },
                    navArgument("otherName") { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument("adTitle") { type = NavType.StringType; nullable = true; defaultValue = null },
                ),
                deepLinks = listOf(navDeepLink { uriPattern = "br.com.tauzeclass.mobile://chat/{adId}/{otherId}" })
            ) {
                ChatScreen(onBackClick = { navController.popBackStack() })
            }
        }
    }
}

@Composable
private fun AnunciarNavIcon() {
    Box(
        modifier = Modifier.size(32.dp).tcShadow(TcShadow.Amber, CircleShape).background(TcColors.Accent, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Icon(Icons.Filled.AddCircle, contentDescription = stringResource(R.string.nav_post_ad), tint = Color.White, modifier = Modifier.size(20.dp))
    }
}

