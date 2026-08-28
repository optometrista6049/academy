export function createControlsScreen(){

    const panel =
        document.createElement('div');

    Object.assign(

        panel.style,

        {

            display:'none',

            position:'fixed',

            inset:'0',

            background:
                'url(assets/ui/controls.jpg)',

            backgroundSize:'cover',

            backgroundPosition:'center',

            zIndex:'10000'

        }

    );

    const closeBtn =
        document.createElement('button');

    closeBtn.innerText = '✕';

    Object.assign(

        closeBtn.style,

        {

            position:'absolute',

            top:'20px',

            right:'20px',

            width:'60px',

            height:'60px',

            fontSize:'28px',

            borderRadius:'50%',

            border:'none',

            cursor:'pointer'

        }

    );

    closeBtn.onclick = ()=>{

        panel.style.display = 'none';

    };

    panel.appendChild(closeBtn);

    return panel;

}