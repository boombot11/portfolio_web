import { Suspense } from "react";
import Splines from "../Spline/spline";
const Helper_sever=()=>{
return   <Suspense fallback={<p>loading</p>}>
<Splines></Splines>
   </Suspense>
}

export default  Helper_sever