let loadingScreen = null;

export function showLoadingScreen(){

    if(loadingScreen) return;

    loadingScreen =
        document.createElement('div');

    Object.assign(

        loadingScreen.style,

        {

            position:'fixed',

            top:'0',

            left:'0',

            width:'100vw',

            height:'100vh',

            backgroundImage:
                'url(assets/ui/loading.jpg)',

            backgroundSize:'cover',

            backgroundPosition:'center center',

            backgroundRepeat:'no-repeat',

            zIndex:'20000'

        }

    );

    document.body.appendChild(
        loadingScreen
    );

}

export function hideLoadingScreen(){

    if(!loadingScreen) return;

    loadingScreen.remove();

    loadingScreen = null;

}