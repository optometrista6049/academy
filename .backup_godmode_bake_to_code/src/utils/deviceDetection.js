export function isMobileDevice(){

    return (

        /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i

        .test(

            navigator.userAgent

        )

    );

}